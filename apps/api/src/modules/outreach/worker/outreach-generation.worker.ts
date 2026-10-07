import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { type AIProvider } from '../domain/ai-provider.interface';
import { OutreachContext } from '../domain/outreach-context.interface';
import { OutreachReasonEvaluator } from '../domain/outreach-reason.evaluator';
import { OutreachPromptBuilder } from '../domain/outreach-prompt.builder';
import { OutreachValidator } from '../domain/outreach-validator';
import { OpportunityType } from '@repo/db';

export interface OutreachGenerationJobPayload {
  outreachId: string;
  expectedDraftVersion: number;
}

@Injectable()
export class OutreachGenerationWorker {
  private readonly logger = new Logger(OutreachGenerationWorker.name);
  private readonly reasonEvaluator = new OutreachReasonEvaluator();
  private readonly validator = new OutreachValidator();

  constructor(
    private readonly prisma: PrismaService,
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
          campaignRecipient: true,
        },
      });

      if (!outreach || outreach.workspaceId !== workspaceId) {
        throw new Error(
          `Tenant mismatch or Outreach ${outreachId} not found in workspace ${workspaceId}`,
        );
      }

      const pca = outreach.personCompanyAssociation;
      if (!pca || pca.workspaceId !== workspaceId) {
        throw new Error(
          `Tenant mismatch for PersonCompanyAssociation in outreach ${outreachId}`,
        );
      }

      // 1. Fetch CareerProfile scoped to workspace
      const careerProfileRecord = await this.prisma.careerProfile.findUnique({
        where: { workspaceId },
      });

      const careerProfile = {
        headline: careerProfileRecord?.headline || null,
        summary: careerProfileRecord?.summary || null,
        experienceSummary: careerProfileRecord?.experienceSummary || null,
        targetRoles: careerProfileRecord?.targetRoles || [],
        skills: careerProfileRecord?.skills || [],
      };

      // 2. Resolve Opportunity: ONLY if campaignRecipient specifies selectedOpportunityId
      let opportunityContext: {
        id?: string | null;
        type: OpportunityType;
        roleTitle?: string | null;
        roleDescription?: string | null;
      } = {
        type: OpportunityType.UNCLASSIFIED,
        id: null,
        roleTitle: null,
        roleDescription: null,
      };

      if (outreach.campaignRecipient?.selectedOpportunityId) {
        const opp = await this.prisma.opportunity.findFirst({
          where: {
            id: outreach.campaignRecipient.selectedOpportunityId,
            workspaceId,
            companyId: pca.companyId,
          },
        });

        if (opp) {
          opportunityContext = {
            id: opp.id,
            type: opp.opportunityType,
            roleTitle: opp.roleTitle,
            roleDescription: opp.roleDescription,
          };
        }
      }

      // 3. Resolve Evidence: Strictly scoped to workspace, company, and companyAssociationId
      const evidenceRecords = await this.prisma.evidence.findMany({
        where: {
          workspaceId,
          companyId: pca.companyId,
          companyAssociationId: pca.id,
        },
      });

      const evidence = evidenceRecords.map((e: any) => ({
        id: e.id,
        opportunityId: e.opportunityId,
        claim: e.claim,
        classification: e.classification,
        sourceName: e.sourceName,
        sourceUrl: e.sourceUrl,
        sourceExcerpt: e.sourceExcerpt,
      }));

      // 4. Assemble bounded OutreachContext
      const context: OutreachContext = {
        workspaceId,
        outreachId,
        person: {
          id: pca.person.id,
          firstName: pca.person.firstName,
          lastName: pca.person.lastName,
          title: pca.person.title || pca.role || null,
          kind: pca.person.personKind,
        },
        company: {
          id: pca.company.id,
          name: pca.company.name,
          domain: pca.company.domain,
          description: null,
          industry: null,
        },
        opportunity: opportunityContext,
        careerProfile,
        evidence,
      };

      // 5. Evaluate Reason & Build Prompt
      const reasonResult = this.reasonEvaluator.evaluate(context);
      const prompt = OutreachPromptBuilder.build(context, reasonResult);

      // Append explicit user aiPromptContext if present on Outreach
      if (outreach.aiPromptContext) {
        prompt.userPrompt += `\n\n### ADDITIONAL USER INSTRUCTIONS\n${outreach.aiPromptContext}`;
      }

      // 6. Invoke AI Provider
      const aiResponse = await this.aiProvider.complete({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
      });

      // 7. Validate Output strictly (No fallback parsing!)
      const validatedDraft = this.validator.validate(
        aiResponse.rawText,
        context,
      );

      // 8. Atomic transaction guarded by job.leaseVersion & outreach.draftVersion
      await this.prisma.$transaction(async (tx: any) => {
        // Fencing step: First atomically advance job lease from leaseVersion to leaseVersion + 1.
        // If another worker or recovery advanced leaseVersion, count will be 0 and no Outreach side effects occur.
        const currentOutreach = await tx.outreach.findUnique({
          where: { id: outreachId },
        });

        if (!currentOutreach) {
          throw new Error(
            `Outreach ${outreachId} not found during generation commit`,
          );
        }

        const skippedDueToEdit = currentOutreach.draftVersion !== expectedDraftVersion;

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
          throw new Error(
            'Concurrent lease conflict: Job leaseVersion was incremented',
          );
        }

        // Only executed if this worker holds and advances the lease:
        if (skippedDueToEdit) {
          this.logger.warn(
            `Draft modified concurrently for outreach ${outreachId} (expected: ${expectedDraftVersion}, current: ${currentOutreach.draftVersion}); preserving manual edits.`,
          );
          await tx.outreach.update({
            where: { id: outreachId },
            data: {
              aiGenerationStatus: 'SKIPPED',
              outreachReason: reasonResult.reasonText,
            },
          });
        } else {
          await tx.outreach.update({
            where: { id: outreachId },
            data: {
              subject: validatedDraft.subject,
              message: validatedDraft.body,
              outreachReason: reasonResult.reasonText,
              aiGenerationStatus: 'SUCCEEDED',
            },
          });
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

      // Ensure that we only update job status if the lease is still valid.
      // If dead-letter, we only update outreach status if the job lease advance succeeded atomically!
      await this.prisma.$transaction(async (tx: any) => {
        const jobUpdateResult = await tx.job.updateMany({
          where: { id: jobId, leaseVersion: job.leaseVersion, status: 'RUNNING' },
          data: {
            status: isDeadLetter ? 'FAILED' : 'PENDING',
            failedAt: isDeadLetter ? new Date() : null,
            lastError: errorMessage,
            availableAt: new Date(Date.now() + backoffMs),
            leaseVersion: { increment: 1 },
          },
        });

        // Only if this worker still owned and advanced the job lease may it mark outreach as FAILED
        if (jobUpdateResult.count > 0 && isDeadLetter) {
          await tx.outreach.updateMany({
            where: { id: outreachId },
            data: { aiGenerationStatus: 'FAILED' },
          });
        }
      }).catch((txErr: any) => {
        this.logger.warn(
          `Could not update failed status for job ${jobId}: ${txErr instanceof Error ? txErr.message : String(txErr)}`,
        );
      });

      return false;
    }
  }
}
