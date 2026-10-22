import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { type AIProvider } from '../domain/ai-provider.interface';
import { OutreachContext } from '../domain/outreach-context.interface';
import { OutreachReasonEvaluator } from '../domain/outreach-reason.evaluator';
import { OutreachPromptBuilder } from '../domain/outreach-prompt.builder';
import { OutreachValidator } from '../domain/outreach-validator';
import { type OutreachGenerationJobPayload } from '../application/generate-outreach.use-case';
import { Prisma } from '@repo/db';

@Injectable()
export class OutreachGenerationWorker {
  private readonly logger = new Logger(OutreachGenerationWorker.name);
  private readonly evaluator = new OutreachReasonEvaluator();
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
    const { workspaceId, campaignMemberId: campaignMemberId, companyId } = payload;

    try {
      // 1. Tenant-Isolated Data Fetching & Context Assembly
      const campaignMember = await this.prisma.campaignMember.findUnique({
        where: { id: campaignMemberId },
        include: {
          person: true,
          campaign: {
            include: {
              company: true,
            },
          },
          selectedOpportunity: true,
        },
      });

      if (!campaignMember || campaignMember.workspaceId !== workspaceId) {
        throw new Error(
          `Tenant mismatch or CampaignMember ${campaignMemberId} not found`,
        );
      }

      // Check worker stale attempt protection: abort if updated after job creation
      if (campaignMember.updatedAt > job.createdAt) {
        this.logger.warn(
          `Stale attempt detected for job ${jobId}; CampaignMember updated after job creation. Aborting execution.`,
        );
        await this.prisma.job.update({
          where: { id: jobId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        return true;
      }

      const careerProfile = await this.prisma.careerProfile.findUnique({
        where: { workspaceId },
      });

      const company = campaignMember.campaign.company;
      const contact = campaignMember.person;
      const opportunity = campaignMember.selectedOpportunity;

      const evidenceList = await this.prisma.evidence.findMany({
        where: {
          workspaceId,
          companyId,
        },
      });

      const context: OutreachContext = {
        workspaceId,
        campaignMemberId: campaignMemberId,
        person: {
          id: contact.id,
          firstName: contact.firstName, lastName: contact.lastName,
          title: contact.title,
          kind: contact.personKind,
        },
        company: {
          id: company.id,
          name: company.name,
          domain: company.domain,
          description: company.description,
          industry: company.industry,
        },
        opportunity: {
          id: opportunity?.id,
          type: opportunity?.opportunityType || 'UNCLASSIFIED',
          roleTitle: opportunity?.roleTitle,
          roleDescription: opportunity?.roleDescription,
        },
        careerProfile: {
          headline: careerProfile?.headline,
          summary: careerProfile?.summary,
          experienceSummary: careerProfile?.experienceSummary,
          targetRoles: careerProfile?.targetRoles || [],
          skills: careerProfile?.skills || [],
        },
        evidence: evidenceList.map((e) => ({
          id: e.id,
          claim: e.claim,
          classification: e.classification,
          sourceName: e.sourceName,
          sourceUrl: e.sourceUrl,
        })),
      };

      // 2. Deterministic Outreach Reason Evaluation (No AI)
      const reasonResult = this.evaluator.evaluate(context);

      // 3. Prompt Construction
      const builtPrompt = OutreachPromptBuilder.build(context, reasonResult);

      // 4. Provider Completion (30s timeout owned by adapter)
      const completionResult = await this.aiProvider.complete(builtPrompt);

      // 5. 4-Stage Validation Pipeline (Parse -> Structural Zod -> Deterministic Zero-Fabrication)
      const validatedDraft = this.validator.validate(
        completionResult.rawText,
        context,
      );

      // 6. Final Transactional Persistence & Atomic Job Completion
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Re-verify stale attempt within transaction
        const currentCC = await tx.campaignMember.findUnique({
          where: { id: campaignMemberId },
        });

        if (!currentCC || currentCC.updatedAt > job.createdAt) {
          throw new Error(
            'Stale attempt concurrent update detected inside transaction',
          );
        }

        await tx.campaignMember.update({
          where: { id: campaignMemberId },
          data: {
            outreachReason: reasonResult.reasonText,
            currentSubject: validatedDraft.subject,
            currentBody: validatedDraft.body,
            // Status remains PENDING until BL-012 human approval
          },
        });

        await tx.job.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });
      });

      this.logger.log(
        `Successfully completed outreach generation for CampaignMember ${campaignMemberId}`,
      );
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

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: isDeadLetter ? 'FAILED' : 'PENDING',
          failedAt: isDeadLetter ? new Date() : null,
          lastError: errorMessage,
          availableAt: new Date(Date.now() + backoffMs),
        },
      });

      return false;
    }
  }
}
