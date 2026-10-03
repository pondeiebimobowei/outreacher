import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaClient } from '@repo/db';
import { type AIProvider } from '../domain/ai-provider.interface';

export interface OutreachGenerationJobPayload {
  outreachId: string;
  expectedDraftVersion: number;
}

@Injectable()
export class OutreachGenerationWorker {
  private readonly logger = new Logger(OutreachGenerationWorker.name);

  constructor(
    private readonly prisma: PrismaClient,
    @Inject('AIProvider') private readonly aiProvider: AIProvider,
  ) {}

  public async processJob(jobId: string): Promise<boolean> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
    });

    if (
      !job ||
      job.type !== 'OUTREACH_GENERATION' ||
      job.status !== 'RUNNING'
    ) {
      return false;
    }

    const payload = job.payload as unknown as OutreachGenerationJobPayload;
    const { outreachId, expectedDraftVersion } = payload;
    const workspaceId = job.workspaceId;

    try {
      const outreach = await this.prisma.outreach.findUnique({
        where: { id: outreachId },
        include: {
          personCompanyAssociation: {
            include: { person: true, company: true },
          },
        },
      });

      if (!outreach || outreach.workspaceId !== workspaceId) {
        throw new Error(
          `Tenant mismatch or Outreach ${outreachId} not found in workspace ${workspaceId}`,
        );
      }

      const pca = outreach.personCompanyAssociation;
      const prompt = [
        `You are generating an email outreach.`,
        `Contact: ${pca.person.firstName} ${pca.person.lastName}, Title: ${pca.role || 'Executive'}`,
        `Company: ${pca.company.name}`,
        outreach.aiPromptContext ? `Context: ${outreach.aiPromptContext}` : '',
        `Return JSON format: { "subject": "...", "body": "..." }`,
      ].filter(Boolean).join('\n');

      const aiResponse = await this.aiProvider.complete(prompt);
      let subject = 'Connecting with you';
      let body = `Hello ${pca.person.firstName}, would love to connect with ${pca.company.name}.`;

      try {
        const parsed = JSON.parse(aiResponse.rawText);
        if (parsed.subject) subject = parsed.subject;
        if (parsed.body) body = parsed.body;
      } catch {
        // Fallback to text parsing or defaults
        if (aiResponse.rawText.includes('\n')) {
          const lines = aiResponse.rawText.split('\n');
          subject = lines[0].replace(/^Subject:\s*/i, '');
          body = lines.slice(1).join('\n').trim();
        }
      }

      await this.prisma.$transaction(async (tx: any) => {
        const currentOutreach = await tx.outreach.findUnique({
          where: { id: outreachId },
        });

        if (!currentOutreach) {
          throw new Error(`Outreach ${outreachId} not found during generation commit`);
        }

        let skippedDueToEdit = false;
        if (currentOutreach.draftVersion !== expectedDraftVersion) {
          this.logger.warn(
            `Draft modified concurrently for outreach ${outreachId} (expected: ${expectedDraftVersion}, current: ${currentOutreach.draftVersion}); preserving manual edits.`,
          );
          skippedDueToEdit = true;
        } else {
          await tx.outreach.update({
            where: { id: outreachId },
            data: {
              subject,
              message: body,
            },
          });
        }

        const updateResult = await tx.job.updateMany({
          where: {
            id: jobId,
            leaseVersion: job.leaseVersion,
            status: 'RUNNING',
          },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            lastError: skippedDueToEdit ? 'SKIPPED_DRAFT_MODIFIED' : null,
            leaseVersion: { increment: 1 },
          },
        });

        if (updateResult.count === 0) {
          throw new Error('Concurrent lease conflict: Job leaseVersion was incremented');
        }
      });

      this.logger.log(`Completed outreach generation for job ${jobId}`);
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Outreach generation failed for job ${jobId}: ${errorMessage}`,
      );

      const nextAttempt = job.attemptCount;
      const isDeadLetter = nextAttempt >= job.maxAttempts;
      const backoffMs = Math.pow(2, nextAttempt) * 1000;

      await this.prisma.job.updateMany({
        where: { id: jobId, leaseVersion: job.leaseVersion },
        data: {
          status: isDeadLetter ? 'FAILED' : 'PENDING',
          failedAt: isDeadLetter ? new Date() : null,
          lastError: errorMessage,
          availableAt: new Date(Date.now() + backoffMs),
          leaseVersion: { increment: 1 },
        },
      });

      return false;
    }
  }
}
