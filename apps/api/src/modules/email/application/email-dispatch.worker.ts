import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EmailSendStatus,
  Job,
  JobStatus,
  Prisma,
} from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import { EmailProviderRegistry } from '../infrastructure/email-provider.registry';
import {
  SECRET_RESOLVER_TOKEN,
  type ISecretResolver,
} from '../domain/secret-resolver.interface';
import {
  SendEmailResult,
  EmailDispatchErrorCode,
} from '../domain/email-provider.adapter';
import { EmailProviderException } from '../infrastructure/resend-email-provider.adapter';
import { ScheduleFollowUpUseCase } from './schedule-follow-up.use-case';

export interface ClaimedEmailJob {
  job: Job;
  claimedAttempt: number;
}

@Injectable()
export class EmailDispatchWorker {
  private readonly logger = new Logger(EmailDispatchWorker.name);
  private readonly MAX_ATTEMPTS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: EmailProviderRegistry,
    @Inject(SECRET_RESOLVER_TOKEN)
    private readonly secretResolver: ISecretResolver,
    private readonly scheduleFollowUpUseCase?: ScheduleFollowUpUseCase,
  ) {}

  /**
   * Claims an eligible PENDING email dispatch job using PostgreSQL FOR UPDATE SKIP LOCKED.
   */
  async claimNextJob(): Promise<ClaimedEmailJob | null> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const now = new Date();
      const eligibleJobs = await tx.$queryRaw<
        Array<{ id: string; attempt_count: number }>
      >`
        SELECT id, attempt_count 
        FROM jobs 
        WHERE type = 'EMAIL_DISPATCH' 
          AND status = 'PENDING'
          AND available_at <= ${now}
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

  public async recoverStaleJobs(): Promise<number> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = await this.prisma.job.updateMany({
      where: {
        type: 'EMAIL_DISPATCH',
        status: 'RUNNING',
        updatedAt: { lt: fiveMinutesAgo },
      },
      data: {
        status: 'PENDING',
        availableAt: new Date(),
        leaseVersion: { increment: 1 },
      },
    });
    return result.count;
  }

  async processJob(claimed: ClaimedEmailJob): Promise<boolean> {
    const { job, claimedAttempt } = claimed;
    const payload = job.payload as Record<string, unknown> | null;
    const emailSendId = payload?.emailSendId as string;
    const workspaceId = job.workspaceId;

    // 1. Pre-dispatch boundary check & transition to SENDING inside transaction
    const preDispatchResult = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const emailSend = await tx.emailSend.findUnique({
          where: { id: emailSendId },
          include: {
            senderAccount: {
              include: { integration: true },
            },
            outreach: {
              include: {
                personCompanyAssociation: { include: { person: true } },
                campaignRecipient: { include: { campaign: true } },
              },
            },
          },
        });

        if (!emailSend || emailSend.workspaceId !== workspaceId) {
          throw new Error(
            `EmailSend ${emailSendId} not found or tenant mismatch`,
          );
        }

        const campaign = emailSend.outreach?.campaignRecipient?.campaign;
        const recipient = emailSend.outreach?.campaignRecipient;

        // Pre-dispatch campaign pause boundary
        if (campaign && campaign.status !== 'ACTIVE') {
          await tx.emailSend.update({
            where: { id: emailSendId },
            data: { status: 'CANCELLED' as any },
          });
          await tx.outreach.update({
            where: { id: emailSend.outreachId },
            data: { status: 'PAUSED' },
          });
          await tx.job.updateMany({
            where: { id: job.id, leaseVersion: job.leaseVersion, status: 'RUNNING' },
            data: {
              status: 'COMPLETED',
              cancellationReason: 'PAUSED',
              completedAt: new Date(),
            },
          });
          return { aborted: true, emailSend };
        }

        // Pre-dispatch recipient eligibility check
        if (
          recipient &&
          (recipient.status === 'SUPPRESSED' || recipient.status === 'PAUSED')
        ) {
          await tx.emailSend.update({
            where: { id: emailSendId },
            data: { status: 'CANCELLED' as any },
          });
          await tx.outreach.update({
            where: { id: emailSend.outreachId },
            data: { status: 'PAUSED' },
          });
          await tx.job.updateMany({
            where: { id: job.id, leaseVersion: job.leaseVersion, status: 'RUNNING' },
            data: {
              status: 'COMPLETED',
              cancellationReason: 'SUPPRESSED',
              completedAt: new Date(),
            },
          });
          return { aborted: true, emailSend };
        }

        const now = new Date();
        const updateData: any = { status: EmailSendStatus.SENDING };
        if (!emailSend.firstProviderAttemptAt) {
          updateData.firstProviderAttemptAt = now;
        }

        const updatedEmailSend = await tx.emailSend.update({
          where: { id: emailSendId },
          data: updateData,
          include: {
            senderAccount: {
              include: { integration: true },
            },
            outreach: {
              include: {
                personCompanyAssociation: { include: { person: true } },
                campaignRecipient: { include: { campaign: true } },
              },
            },
          },
        });

        return { aborted: false, emailSend: updatedEmailSend };
      },
    );

    if (preDispatchResult.aborted) {
      return false;
    }

    const emailSend = preDispatchResult.emailSend;

    // 2. Provider API dispatch outside transaction
    let sendResult: SendEmailResult | null = null;
    let dispatchError: Error | null = null;
    let isUncertainTimeout = false;
    let isTransient = false;

    try {
      const senderAccount = emailSend.senderAccount;
      if (!senderAccount) {
        throw new Error('EmailSend is missing senderAccount');
      }

      const providerStr = emailSend.provider;
      if (!providerStr) {
        throw new Error('EmailSend is missing provider');
      }

      const adapter = this.providerRegistry.getAdapter(providerStr);
      if (!adapter) {
        throw new EmailProviderException(
          `Provider adapter not found for ${providerStr}`,
          EmailDispatchErrorCode.PROVIDER_UNSUPPORTED,
        );
      }

      const credentials = await this.secretResolver.resolve(
        workspaceId,
        senderAccount.integration.secretReference,
        providerStr,
      );

      const recipientEmail =
        emailSend.outreach?.personCompanyAssociation?.workEmail ||
        emailSend.outreach?.personCompanyAssociation?.person?.email;
      if (!recipientEmail) {
        throw new Error('Person recipient email is missing');
      }

      if (!emailSend.replyToToken) {
        throw new Error('Opaque replyToToken is missing for EmailSend');
      }

      const canonicalIdempotencyKey = `send:${emailSendId}`;

      sendResult = await adapter.sendEmail({
        workspaceId,
        senderAccountId: senderAccount.id,
        emailSendId,
        toEmail: recipientEmail,
        fromName: senderAccount.fromName,
        fromEmail: senderAccount.fromEmail,
        replyTo: senderAccount.replyTo || undefined,
        subject: emailSend.subject,
        bodyText: emailSend.body,
        replyToToken: emailSend.replyToToken,
        idempotencyKey: canonicalIdempotencyKey,
        credentials,
      });
    } catch (err: any) {
      this.logger.error(
        `Email dispatch failed for job ${job.id}: ${err?.message}`,
      );
      dispatchError = err instanceof Error ? err : new Error(String(err));

      if (err instanceof EmailProviderException) {
        if (
          err.dispatchErrorCode ===
          EmailDispatchErrorCode.PROVIDER_TIMEOUT_UNCERTAIN
        ) {
          isUncertainTimeout = true;
        } else if (
          err.dispatchErrorCode ===
            EmailDispatchErrorCode.PROVIDER_RATE_LIMIT ||
          err.dispatchErrorCode ===
            EmailDispatchErrorCode.PROVIDER_CONNECT_FAILURE
        ) {
          isTransient = true;
        }
      } else {
        const errorMessage = dispatchError.message.toLowerCase();
        if (errorMessage.includes('timeout')) {
          isUncertainTimeout = true;
        } else if (
          errorMessage.includes('network') ||
          errorMessage.includes('econnrefused') ||
          errorMessage.includes('rate limit')
        ) {
          isTransient = true;
        }
      }
    }

    // 3. Post-dispatch transaction handling
    const now = new Date();

    if (sendResult) {
      return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Atomic lease fencing check on Job
        const leaseCheck = await tx.job.updateMany({
          where: {
            id: job.id,
            leaseVersion: job.leaseVersion,
            status: 'RUNNING',
          },
          data: {
            status: JobStatus.COMPLETED,
            completedAt: now,
          },
        });

        if (leaseCheck.count === 0) {
          this.logger.warn(
            `Job ${job.id} lease generation ${claimedAttempt} lost or reclaimed. Aborting state transition.`,
          );
          return false;
        }

        // Global lock order: Campaign -> CampaignRecipient -> PCA -> Outreach -> EmailSend
        let campaign: any = null;
        let recipient: any = null;
        if (emailSend.outreach?.campaignRecipientId) {
          recipient = await tx.campaignRecipient.findUnique({
            where: { id: emailSend.outreach.campaignRecipientId },
          });
          if (recipient) {
            campaign = await tx.campaign.findUnique({
              where: { id: recipient.campaignId },
            });
          }
        }

        const pca = await tx.personCompanyAssociation.findUnique({
          where: { id: emailSend.outreach.personCompanyAssociationId },
        });

        const outreach = await tx.outreach.findUnique({
          where: { id: emailSend.outreachId },
        });

        // Update EmailSend -> SENT
        await tx.emailSend.update({
          where: { id: emailSendId },
          data: {
            status: EmailSendStatus.SENT,
            providerMessageId: sendResult.providerMessageId,
            messageId: sendResult.messageId,
            sentAt: now,
          },
        });

        // Record ConversationMessage
        await tx.conversationMessage.create({
          data: {
            workspaceId,
            outreachId: emailSend.outreachId,
            kind: 'OUTBOUND',
            subject: emailSend.subject,
            body: emailSend.body,
          },
        });

        // CAS update on PCA for initial send (sequence === 0)
        if (
          emailSend.sequence === 0 &&
          emailSend.expectedStateVersion != null &&
          pca
        ) {
          if (
            pca.conversationState === 'NO_REPLY' &&
            pca.stateVersion === emailSend.expectedStateVersion
          ) {
            await tx.personCompanyAssociation.update({
              where: { id: pca.id },
              data: {
                conversationState: 'ACTIVE',
                stateVersion: { increment: 1 },
              },
            });
          }
        }

        // Post-dispatch pause boundary: verify automation eligibility
        const isCampaignActive = !campaign || campaign.status === 'ACTIVE';
        const isRecipientActive = !recipient || recipient.status === 'ACTIVE';
        const isOutreachSending = outreach?.status === 'SENDING';
        const isPcaValid =
          pca &&
          pca.conversationState !== 'REPLIED' &&
          pca.conversationState !== 'STOPPED';

        const canContinue =
          isCampaignActive &&
          isRecipientActive &&
          isOutreachSending &&
          isPcaValid;

        if (canContinue) {
          await tx.outreach.update({
            where: { id: emailSend.outreachId },
            data: { status: 'ACTIVE' },
          });

          const nextSequence = emailSend.sequence + 1;
          if (outreach && nextSequence <= outreach.maxFollowUps) {
            if (this.scheduleFollowUpUseCase) {
              await this.scheduleFollowUpUseCase.scheduleFollowUpCheck(tx, {
                workspaceId,
                outreachId: outreach.id,
                sequence: nextSequence,
                delayDays: campaign?.followUpDelayBusinessDays ?? 3,
              });
            }
          } else if (recipient) {
            await tx.campaignRecipient.update({
              where: { id: recipient.id },
              data: { status: 'COMPLETED' },
            });
          }
        } else {
          // Ineligible due to in-flight pause/suppression: EmailSend is SENT, Outreach remains/becomes PAUSED, 0 follow-up jobs
          await tx.outreach.update({
            where: { id: emailSend.outreachId },
            data: { status: 'PAUSED' },
          });
        }

        return true;
      });
    }

    // Provider failed or threw error
    const adapter = this.providerRegistry.getAdapter(emailSend.provider);
    const idempotencyWindowMs =
      adapter?.idempotencyWindowMs ?? 24 * 60 * 60 * 1000;
    const safetyMarginMs = 60 * 1000;
    const firstAttempt = emailSend.firstProviderAttemptAt ?? now;
    const isInsideWindow =
      now.getTime() - firstAttempt.getTime() <
      idempotencyWindowMs - safetyMarginMs;

    const canSafeRetry =
      isTransient &&
      !isUncertainTimeout &&
      isInsideWindow &&
      claimedAttempt < this.MAX_ATTEMPTS;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const errorMessage = dispatchError?.message || 'Unknown dispatch error';

      if (canSafeRetry) {
        const backoffMs = Math.pow(2, claimedAttempt) * 10000;
        const leaseCheck = await tx.job.updateMany({
          where: {
            id: job.id,
            leaseVersion: job.leaseVersion,
            status: 'RUNNING',
          },
          data: {
            status: JobStatus.PENDING,
            availableAt: new Date(now.getTime() + backoffMs),
            lastError: errorMessage,
          },
        });

        if (leaseCheck.count === 0) {
          this.logger.warn(
            `Job ${job.id} lease generation ${claimedAttempt} lost on retry.`,
          );
          return false;
        }

        // Transition EmailSend: SENDING -> PENDING
        await tx.emailSend.update({
          where: { id: emailSendId },
          data: { status: EmailSendStatus.PENDING },
        });

        return false;
      }

      // Fatal failure path or DISPATCH_UNKNOWN_REQUIRES_RECONCILIATION
      const leaseCheck = await tx.job.updateMany({
        where: {
          id: job.id,
          leaseVersion: job.leaseVersion,
          status: 'RUNNING',
        },
        data: {
          status: JobStatus.DEAD_LETTER,
          failedAt: now,
          lastError: errorMessage,
        },
      });

      if (leaseCheck.count === 0) {
        this.logger.warn(
          `Job ${job.id} lease generation ${claimedAttempt} lost on failure.`,
        );
        return false;
      }

      let finalErrorCode: EmailDispatchErrorCode =
        EmailDispatchErrorCode.DISPATCH_ATTEMPTS_EXHAUSTED;
      if (isUncertainTimeout || !isInsideWindow) {
        finalErrorCode =
          EmailDispatchErrorCode.DISPATCH_UNKNOWN_REQUIRES_RECONCILIATION;
      } else if (dispatchError && 'dispatchErrorCode' in dispatchError) {
        finalErrorCode = (dispatchError as any).dispatchErrorCode;
      }

      await tx.emailSend.update({
        where: { id: emailSendId },
        data: {
          status: EmailSendStatus.FAILED,
          failedAt: now,
          errorCode: finalErrorCode,
          errorMessage,
          retryable: false,
        },
      });

      await tx.outreach.update({
        where: { id: emailSend.outreachId },
        data: { status: 'FAILED' },
      });

      if (emailSend.outreach?.campaignRecipientId) {
        await tx.campaignRecipient.update({
          where: { id: emailSend.outreach.campaignRecipientId },
          data: { status: 'FAILED' },
        });
      }

      // Fatal failure immediate PCA release:
      const pca = await tx.personCompanyAssociation.findUnique({
        where: { id: emailSend.outreach.personCompanyAssociationId },
      });

      if (pca && pca.conversationState === 'ACTIVE') {
        const openOutreach = await tx.outreach.findFirst({
          where: {
            personCompanyAssociationId: pca.id,
            workspaceId,
            id: { not: emailSend.outreachId },
            status: {
              in: ['DRAFT', 'APPROVED', 'SENDING', 'ACTIVE', 'PAUSED'],
            },
          },
        });

        if (!openOutreach) {
          await tx.personCompanyAssociation.update({
            where: { id: pca.id },
            data: {
              conversationState: 'NO_REPLY',
              stateVersion: { increment: 1 },
            },
          });
        }
      }

      return false;
    });
  }
}
