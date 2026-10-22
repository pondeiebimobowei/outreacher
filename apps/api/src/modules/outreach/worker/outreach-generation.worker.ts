import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { type AIProvider } from '../domain/ai-provider.interface';
import { OutreachContext } from '../domain/outreach-context.interface';
import { OutreachReasonEvaluator } from '../domain/outreach-reason.evaluator';
import { OutreachPromptBuilder } from '../domain/outreach-prompt.builder';
import { OutreachValidator } from '../domain/outreach-validator';
import { Prisma } from '@repo/db';

export interface OutreachGenerationJobPayload {
  userId: string;
  workspaceId: string;
  campaignMemberId?: string;
  outreachId?: string;
  personId: string;
  companyId: string;
  draftVersion: number;
}

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

    if (!job || job.type !== 'OUTREACH_GENERATION' || job.status !== 'RUNNING') {
      return false;
    }

    const payload = job.payload as unknown as OutreachGenerationJobPayload;
    const { workspaceId, campaignMemberId, outreachId, companyId } = payload;

    try {
      let company, contact, opportunity;
      let modelUpdatedAt: Date;

      if (campaignMemberId) {
        const campaignMember = await this.prisma.campaignMember.findUnique({
          where: { id: campaignMemberId },
          include: { person: true, campaign: { include: { company: true } }, selectedOpportunity: true },
        });
        if (!campaignMember || campaignMember.workspaceId !== workspaceId) {
          throw new Error(`Tenant mismatch or CampaignMember ${campaignMemberId} not found`);
        }
        modelUpdatedAt = campaignMember.updatedAt;
        company = campaignMember.campaign.company;
        contact = campaignMember.person;
        opportunity = campaignMember.selectedOpportunity;
      } else if (outreachId) {
        const outreach = await this.prisma.outreach.findUnique({
          where: { id: outreachId },
          include: { personCompanyAssociation: { include: { person: true, company: true } } },
        });
        if (!outreach || outreach.workspaceId !== workspaceId) {
          throw new Error(`Tenant mismatch or Outreach ${outreachId} not found`);
        }
        modelUpdatedAt = outreach.updatedAt;
        company = outreach.personCompanyAssociation.company;
        contact = outreach.personCompanyAssociation.person;
        opportunity = null; // Outreach doesn't currently attach a specific opportunity in schema
      } else {
        throw new Error(`Job ${jobId} payload missing both campaignMemberId and outreachId`);
      }

      if (modelUpdatedAt > job.createdAt) {
        this.logger.warn(`Stale attempt detected for job ${jobId}; model updated after job creation. Aborting.`);
        await this.prisma.job.update({
          where: { id: jobId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        return true;
      }

      const careerProfile = await this.prisma.careerProfile.findUnique({
        where: { workspaceId },
      });

      const evidenceList = await this.prisma.evidence.findMany({
        where: { workspaceId, companyId },
      });

      const context: OutreachContext = {
        workspaceId,
        campaignMemberId, outreachId,
        person: { id: contact.id, firstName: contact.firstName, lastName: contact.lastName, title: contact.title, kind: contact.personKind },
        company: { id: company.id, name: company.name, domain: company.domain, description: company.description, industry: company.industry },
        opportunity: { id: opportunity?.id, type: opportunity?.opportunityType || 'UNCLASSIFIED', roleTitle: opportunity?.roleTitle, roleDescription: opportunity?.roleDescription },
        careerProfile: { headline: careerProfile?.headline, summary: careerProfile?.summary, experienceSummary: careerProfile?.experienceSummary, targetRoles: careerProfile?.targetRoles || [], skills: careerProfile?.skills || [] },
        evidence: evidenceList.map((e) => ({ id: e.id, claim: e.claim, classification: e.classification, sourceName: e.sourceName, sourceUrl: e.sourceUrl })),
      };

      const reasonResult = this.evaluator.evaluate(context);
      const builtPrompt = OutreachPromptBuilder.build(context, reasonResult);
      const completionResult = await this.aiProvider.complete(builtPrompt);
      const validatedDraft = this.validator.validate(completionResult.rawText, context);

      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (campaignMemberId) {
          const currentCC = await tx.campaignMember.findUnique({ where: { id: campaignMemberId } });
          if (!currentCC || currentCC.updatedAt > job.createdAt) throw new Error('Stale attempt concurrent update detected inside transaction');
          await tx.campaignMember.update({
            where: { id: campaignMemberId },
            data: { currentSubject: validatedDraft.subject, currentBody: validatedDraft.body },
          });
        } else if (outreachId) {
          const currentOutreach = await tx.outreach.findUnique({ where: { id: outreachId } });
          if (!currentOutreach || currentOutreach.updatedAt > job.createdAt) throw new Error('Stale attempt concurrent update detected inside transaction');
          await tx.outreach.update({
            where: { id: outreachId },
            data: { subject: validatedDraft.subject, message: validatedDraft.body },
          });
        }

        await tx.job.update({
          where: { id: jobId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      });

      this.logger.log(`Successfully completed outreach generation for job ${jobId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Outreach generation failed for job ${jobId}: ${errorMessage}`);

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
