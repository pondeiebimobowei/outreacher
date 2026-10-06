import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConversationMessage, Job, JobStatus, Prisma } from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import { SendEligibilityService } from '../domain/send-eligibility.service';
import {
  TemplateEngineService,
  TemplateContext,
} from '../../template/domain/template-engine.service';
import type { AIProvider } from '../../outreach/domain/ai-provider.interface';

export interface ClaimedFollowUpJob {
  job: Job;
  claimedAttempt: number;
}

@Injectable()
export class ScheduledFollowUpCheckWorker {
  private readonly logger = new Logger(ScheduledFollowUpCheckWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateEngine: TemplateEngineService,
    private readonly eligibilityService: SendEligibilityService,
    @Optional() @Inject('AIProvider') private readonly aiProvider?: AIProvider,
  ) {}

  /**
   * Claims an eligible PENDING follow-up check job using PostgreSQL FOR UPDATE SKIP LOCKED.
   */
  async claimNextJob(): Promise<ClaimedFollowUpJob | null> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const now = new Date();
      const eligibleJobs = await tx.$queryRaw<
        Array<{ id: string; attempt_count: number }>
      >`
        SELECT id, attempt_count 
        FROM jobs 
        WHERE type = 'SCHEDULED_FOLLOW_UP_CHECK'::"JobType"
          AND status = 'PENDING'::"JobStatus"
          AND (available_at IS NULL OR available_at <= ${now})
        ORDER BY available_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;

      if (!eligibleJobs || eligibleJobs.length === 0) {
        return null;
      }

      const jobId = eligibleJobs[0].id;
      const claimedAttempt = eligibleJobs[0].attempt_count + 1;

      const updatedJob = await tx.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.RUNNING,
          attemptCount: claimedAttempt,
          startedAt: now,
          leaseVersion: { increment: 1 },
        },
      });

      return {
        job: updatedJob,
        claimedAttempt,
      };
    });
  }

  async processJob(claimed: ClaimedFollowUpJob): Promise<boolean> {
    const { job } = claimed;
    const payload = job.payload as Record<string, unknown> | null;
    const outreachId = payload?.outreachId as string;
    const sequence = Number(payload?.sequence ?? 1);
    const workspaceId = job.workspaceId;

    // Check outreach content source
    const outreachHeader = await this.prisma.outreach.findUnique({
      where: { id: outreachId },
      select: { contentSource: true, templateId: true, aiPromptContext: true },
    });

    if (!outreachHeader) {
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.DEAD_LETTER, lastError: 'Outreach not found' },
      });
      return false;
    }

    if (outreachHeader.contentSource === 'TEMPLATE') {
      return this.processTemplateFollowUp(job, outreachId, sequence, workspaceId);
    } else if (outreachHeader.contentSource === 'AI') {
      return this.processAiFollowUp(job, outreachId, sequence, workspaceId);
    } else {
      // MANUAL outreach: no automated follow-up step
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.COMPLETED, completedAt: new Date() },
      });
      return true;
    }
  }

  /**
   * Template follow-up execution under global lock order
   */
  private async processTemplateFollowUp(
    job: Job,
    outreachId: string,
    sequence: number,
    workspaceId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Lock Outreach
      const outreach = await tx.outreach.findUnique({
        where: { id: outreachId },
        include: {
          personCompanyAssociation: {
            include: { person: true, company: true },
          },
          campaignRecipient: {
            include: { campaign: true, opportunity: true },
          },
        },
      });

      if (!outreach || outreach.workspaceId !== workspaceId) {
        return false;
      }

      if (!outreach.templateId) {
        throw new Error('Template outreach is missing templateId');
      }

      // Lock EmailTemplate FOR SHARE
      await tx.$queryRaw`
        SELECT id FROM email_templates
        WHERE id = ${outreach.templateId}
        FOR SHARE
      `;

      // Lock Campaign & CampaignRecipient if linked
      const campaign = outreach.campaignRecipient?.campaign;
      const recipient = outreach.campaignRecipient;

      if (campaign) {
        await tx.$queryRaw`
          SELECT id FROM campaigns
          WHERE id = ${campaign.id}
          FOR UPDATE
        `;
      }
      if (recipient) {
        await tx.$queryRaw`
          SELECT id FROM campaign_recipients
          WHERE id = ${recipient.id}
          FOR UPDATE
        `;
      }

      // Lock PCA FOR UPDATE
      const pca = outreach.personCompanyAssociation;
      await tx.$queryRaw`
        SELECT id FROM person_company_associations
        WHERE id = ${pca.id}
        FOR UPDATE
      `;

      // Check eligibility
      if (outreach.status !== 'ACTIVE') {
        await tx.job.updateMany({
          where: { id: job.id, leaseVersion: job.leaseVersion, status: 'RUNNING' },
          data: { status: JobStatus.COMPLETED, completedAt: new Date() },
        });
        return false;
      }

      if (
        pca.conversationState === 'REPLIED' ||
        pca.conversationState === 'STOPPED'
      ) {
        await tx.job.updateMany({
          where: { id: job.id, leaseVersion: job.leaseVersion, status: 'RUNNING' },
          data: {
            status: JobStatus.CANCELLED,
            cancellationReason: 'CANCELLED_BY_USER',
            completedAt: new Date(),
          },
        });
        return false;
      }

      if (campaign && campaign.status !== 'ACTIVE') {
        await tx.job.updateMany({
          where: { id: job.id, leaseVersion: job.leaseVersion, status: 'RUNNING' },
          data: { status: JobStatus.COMPLETED, completedAt: new Date() },
        });
        return false;
      }

      // Sequence uniqueness check
      const existingSend = await tx.emailSend.findFirst({
        where: { outreachId, sequence },
      });
      if (existingSend) {
        await tx.job.updateMany({
          where: { id: job.id, leaseVersion: job.leaseVersion, status: 'RUNNING' },
          data: { status: JobStatus.COMPLETED, completedAt: new Date() },
        });
        return true;
      }

      // Load Template Step
      const step = await tx.emailTemplateStep.findUnique({
        where: {
          templateId_sequence: {
            templateId: outreach.templateId,
            sequence,
          },
        },
      });

      if (!step) {
        throw new Error(
          `EmailTemplateStep not found for template ${outreach.templateId} sequence ${sequence}`,
        );
      }

      // Build Template Context
      const context: TemplateContext = {
        contact: {
          firstName: pca.person.firstName,
          lastName: pca.person.lastName,
          title: pca.role,
        },
        company: {
          name: pca.company.name,
          websiteUrl: pca.company.websiteUrl,
          domain: pca.company.domain,
        },
        opportunity: {
          roleTitle: recipient?.opportunity?.roleTitle ?? null,
        },
        recipient: {
          role: recipient?.targetRole ?? pca.role,
        },
      };

      const resolvedSubject = this.templateEngine.renderTemplate(
        step.subjectTemplate,
        context,
      );
      const resolvedBody = this.templateEngine.renderTemplate(
        step.bodyTemplate,
        context,
      );

      // Reserve capacity and create EmailSend
      const emailSend =
        await this.eligibilityService.reserveSenderCapacityAndCreateEmailSend(
          tx,
          {
            workspaceId,
            outreachId,
            sequence,
            type: 'FOLLOW_UP',
            expectedStateVersion: pca.stateVersion,
            subject: resolvedSubject,
            body: resolvedBody,
            preferredSenderAccountId: outreach.senderAccountId,
            campaignId: campaign?.id ?? null,
          },
        );

      // Transition Outreach.status: ACTIVE -> SENDING
      await tx.outreach.update({
        where: { id: outreachId },
        data: { status: 'SENDING' },
      });

      // Enqueue EMAIL_DISPATCH job
      await tx.job.create({
        data: {
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.PENDING,
          payload: { emailSendId: emailSend.id, outreachId },
          idempotencyKey: `dispatch:${emailSend.id}`,
        },
      });

      // Complete follow-up check job
      await tx.job.updateMany({
        where: { id: job.id, leaseVersion: job.leaseVersion, status: 'RUNNING' },
        data: { status: JobStatus.COMPLETED, completedAt: new Date() },
      });

      return true;
    });
  }

  /**
   * AI follow-up 3-phase execution:
   * Phase 1: Claim Job & Snapshot State (Short DB Transaction)
   * Phase 2: External LLM Follow-Up Synthesis (Outside DB Locks)
   * Phase 3: Re-validate & Atomic Reservation (Short DB Transaction)
   */
  private async processAiFollowUp(
    job: Job,
    outreachId: string,
    sequence: number,
    workspaceId: string,
  ): Promise<boolean> {
    // Phase 1: Claim Job & Snapshot State (Short DB Transaction)
    const phase1Result = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const outreach = await tx.outreach.findUnique({
          where: { id: outreachId },
          include: {
            personCompanyAssociation: {
              include: { person: true, company: true },
            },
            campaignRecipient: {
              include: { campaign: true, opportunity: true },
            },
            conversationMessages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });

        if (!outreach || outreach.workspaceId !== workspaceId) {
          return { eligible: false, abortReason: 'NOT_FOUND' };
        }

        const pca = outreach.personCompanyAssociation;
        if (
          outreach.status !== 'ACTIVE' ||
          pca.conversationState === 'REPLIED' ||
          pca.conversationState === 'STOPPED'
        ) {
          await tx.job.updateMany({
            where: { id: job.id, leaseVersion: job.leaseVersion, status: 'RUNNING' },
            data: { status: JobStatus.COMPLETED, completedAt: new Date() },
          });
          return { eligible: false, abortReason: 'INELIGIBLE' };
        }

        return {
          eligible: true,
          outreach,
          expectedStateVersion: pca.stateVersion,
        };
      },
    );

    if (!phase1Result.eligible || !phase1Result.outreach) {
      return false;
    }

    const outreach = phase1Result.outreach;
    const expectedStateVersion = phase1Result.expectedStateVersion!;
    const pca = outreach.personCompanyAssociation;

    // Phase 2: External LLM Follow-Up Synthesis (Outside DB Locks)
    let aiSubject = `Re: ${outreach.subject}`;
    let aiBody = `Hi ${pca.person.firstName}, following up on my previous note.`;

    if (this.aiProvider) {
      const prompt = [
        `You are generating an email follow-up for sequence ${sequence}.`,
        `Contact: ${pca.person.firstName} ${pca.person.lastName}`,
        `Company: ${pca.company.name}`,
        outreach.aiPromptContext ? `Prompt Context: ${outreach.aiPromptContext}` : '',
        `Previous Thread:`,
        outreach.conversationMessages
          .map((m: ConversationMessage ) => `[${m.kind}] ${m.subject}: ${m.body}`)
          .join('\n'),
        `Return JSON: { "subject": "...", "body": "..." }`,
      ].filter(Boolean).join('\n');

      const response = await this.aiProvider.complete({
        systemPrompt: 'You are an email assistant generating follow-ups.',
        userPrompt: prompt,
      });

      try {
        const parsed = JSON.parse(response.rawText);
        if (parsed.subject) aiSubject = parsed.subject;
        if (parsed.body) aiBody = parsed.body;
      } catch {
        if (response.rawText.trim().length > 0) {
          aiBody = response.rawText.trim();
        }
      }
    }

    // Phase 3: Re-validate & Atomic Reservation (Short DB Transaction)
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Lock Campaign & CampaignRecipient if linked
      const campaign = outreach.campaignRecipient?.campaign;
      const recipient = outreach.campaignRecipient;

      if (campaign) {
        await tx.$queryRaw`
          SELECT id FROM campaigns WHERE id = ${campaign.id} FOR UPDATE
        `;
      }
      if (recipient) {
        await tx.$queryRaw`
          SELECT id FROM campaign_recipients WHERE id = ${recipient.id} FOR UPDATE
        `;
      }

      // Lock PCA FOR UPDATE
      const lockedPca = await tx.personCompanyAssociation.findUnique({
        where: { id: pca.id },
      });

      // Lock Outreach FOR UPDATE
      const lockedOutreach = await tx.outreach.findUnique({
        where: { id: outreachId },
      });

      const lockedCampaign = campaign
        ? await tx.campaign.findUnique({ where: { id: campaign.id } })
        : null;
      const lockedRecipient = recipient
        ? await tx.campaignRecipient.findUnique({ where: { id: recipient.id } })
        : null;
      const ineligibleRecipientStatuses = [
        'COMPLETED',
        'SUPPRESSED',
        'FAILED',
        'REMOVED',
      ];

      // Re-validate semantic eligibility (NOT exact stateVersion equality)
      if (
        !lockedPca ||
        lockedPca.conversationState === 'REPLIED' ||
        lockedPca.conversationState === 'STOPPED' ||
        !lockedOutreach ||
        lockedOutreach.status !== 'ACTIVE' ||
        (campaign && (!lockedCampaign || lockedCampaign.status !== 'ACTIVE')) ||
        (recipient &&
          (!lockedRecipient ||
            ineligibleRecipientStatuses.includes(lockedRecipient.status)))
      ) {
        this.logger.warn(
          `Phase 3 validation failed: state changed during AI synthesis. Aborting reservation.`,
        );
        await tx.job.updateMany({
          where: { id: job.id, leaseVersion: job.leaseVersion, status: 'RUNNING' },
          data: {
            status: JobStatus.CANCELLED,
            cancellationReason: 'CANCELLED_BY_USER',
            completedAt: new Date(),
          },
        });
        return false;
      }

      // Re-validate sequence uniqueness
      const existingSend = await tx.emailSend.findFirst({
        where: { outreachId, sequence },
      });
      if (existingSend) {
        await tx.job.updateMany({
          where: { id: job.id, leaseVersion: job.leaseVersion, status: 'RUNNING' },
          data: { status: JobStatus.COMPLETED, completedAt: new Date() },
        });
        return true;
      }

      // Reserve capacity and create EmailSend
      const emailSend =
        await this.eligibilityService.reserveSenderCapacityAndCreateEmailSend(
          tx,
          {
            workspaceId,
            outreachId,
            sequence,
            type: 'FOLLOW_UP',
            expectedStateVersion: lockedPca.stateVersion,
            subject: aiSubject,
            body: aiBody,
            preferredSenderAccountId: outreach.senderAccountId,
            campaignId: campaign?.id ?? null,
          },
        );

      // Transition Outreach.status: ACTIVE -> SENDING
      await tx.outreach.update({
        where: { id: outreachId },
        data: { status: 'SENDING' },
      });

      // Enqueue EMAIL_DISPATCH job
      await tx.job.create({
        data: {
          workspaceId,
          type: 'EMAIL_DISPATCH',
          status: JobStatus.PENDING,
          payload: { emailSendId: emailSend.id, outreachId },
          idempotencyKey: `dispatch:${emailSend.id}`,
        },
      });

      // Complete follow-up check job
      await tx.job.updateMany({
        where: { id: job.id, leaseVersion: job.leaseVersion, status: 'RUNNING' },
        data: { status: JobStatus.COMPLETED, completedAt: new Date() },
      });

      return true;
    });
  }
}
