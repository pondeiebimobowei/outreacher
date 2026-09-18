import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CampaignContactStatus,
  EmailSendStatus,
  Job,
  JobStatus,
  Prisma,
} from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import {
  EMAIL_SENDER_TOKEN,
  EmailRateLimitException,
  EmailTimeoutException,
  SendEmailResult,
} from '../domain/email-sender.interface';
import type { IEmailSender } from '../domain/email-sender.interface';

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
    @Inject(EMAIL_SENDER_TOKEN)
    private readonly emailSender: IEmailSender,
  ) {}

  /**
   * Claims an eligible PENDING email dispatch job using PostgreSQL FOR UPDATE SKIP LOCKED.
   * Atomically advances Job status to RUNNING, increments attemptCount, and advances EmailSend RESERVED -> SENDING.
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
        },
      });

      const payload = updatedJob.payload as Record<string, unknown> | null;
      const emailSendId = payload?.emailSendId as string | undefined;

      if (emailSendId) {
        // If the EmailSend is in RESERVED status (first attempt), transition it to SENDING.
        // If already in SENDING status (subsequent retry), leave it in SENDING.
        const currentSend = await tx.emailSend.findUnique({
          where: { id: emailSendId },
        });

        if (currentSend && currentSend.status === EmailSendStatus.RESERVED) {
          await tx.emailSend.update({
            where: { id: emailSendId },
            data: { status: EmailSendStatus.SENDING },
          });
        }
      }

      return {
        job: updatedJob,
        claimedAttempt,
      };
    });
  }

  /**
   * Processes a claimed email dispatch job outside the database transaction,
   * then atomically updates send status and completes or retries the job.
   */
  async processJob(claimed: ClaimedEmailJob): Promise<boolean> {
    const { job, claimedAttempt } = claimed;
    const payload = job.payload as Record<string, unknown> | null;
    const emailSendId = payload?.emailSendId as string;
    const campaignContactId = payload?.campaignContactId as string;
    const workspaceId = job.workspaceId;

    let sendResult: SendEmailResult | null = null;
    let dispatchError: Error | null = null;

    try {
      // 1. Fetch send record and related contact/campaign data
      const emailSend = await this.prisma.emailSend.findUnique({
        where: { id: emailSendId },
        include: {
          campaignContact: {
            include: {
              contact: true,
              campaign: true,
            },
          },
        },
      });

      if (!emailSend || emailSend.workspaceId !== workspaceId) {
        throw new Error(
          `EmailSend ${emailSendId} not found or tenant mismatch`,
        );
      }

      const recipientEmail = emailSend.campaignContact?.contact?.email;
      if (!recipientEmail) {
        throw new Error('Contact recipient email is missing');
      }

      const fromEmail =
        emailSend.campaignContact?.campaign?.sendingIdentity ||
        process.env.DEFAULT_FROM_EMAIL ||
        'outreach@outreacher.app';

      const canonicalIdempotencyKey = `send:${campaignContactId}:1`;

      // 2. Invoke provider adapter outside DB transaction
      sendResult = await this.emailSender.sendEmail({
        workspaceId,
        campaignContactId,
        toEmail: recipientEmail,
        fromEmail,
        subject: emailSend.subject,
        bodyText: emailSend.body,
        replyToToken: campaignContactId,
        idempotencyKey: canonicalIdempotencyKey,
      });
    } catch (err: any) {
      this.logger.error(
        `Email dispatch failed for job ${job.id}: ${err?.message}`,
      );
      dispatchError = err instanceof Error ? err : new Error(String(err));
    }

    // 3. Atomically finalize outcome or handle retry
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Lease check
      const currentJob = await tx.job.findFirst({
        where: {
          id: job.id,
          status: JobStatus.RUNNING,
          attemptCount: claimedAttempt,
        },
      });

      if (!currentJob) {
        this.logger.warn(
          `Job ${job.id} lease generation ${claimedAttempt} lost or reclaimed. Aborting finalization.`,
        );
        return false;
      }

      const now = new Date();

      if (sendResult) {
        // Success path:
        // Update EmailSend to SENT with provider and RFC message IDs
        await tx.emailSend.update({
          where: { id: emailSendId },
          data: {
            status: EmailSendStatus.SENT,
            providerMessageId: sendResult.providerMessageId,
            messageId: sendResult.rfcMessageId,
            sentAt: sendResult.sentAt,
          },
        });

        // Update CampaignContact to SENT
        await tx.campaignContact.update({
          where: { id: campaignContactId },
          data: { status: CampaignContactStatus.SENT },
        });

        // Complete Job
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.COMPLETED,
            completedAt: now,
          },
        });

        return true;
      }

      // Failure path:
      const errorMessage = dispatchError?.message || 'Unknown dispatch error';
      const isTransient =
        dispatchError instanceof EmailTimeoutException ||
        dispatchError instanceof EmailRateLimitException ||
        errorMessage.toLowerCase().includes('timeout') ||
        errorMessage.toLowerCase().includes('network');

      if (isTransient && claimedAttempt < this.MAX_ATTEMPTS) {
        // Retryable: EmailSend and CampaignContact REMAIN in SENDING status!
        const backoffMs = Math.pow(2, claimedAttempt) * 1000;
        const nextAvailableAt = new Date(now.getTime() + backoffMs);

        await tx.job.update({
          where: { id: job.id },
          data: {
            status: JobStatus.PENDING,
            availableAt: nextAvailableAt,
            lastError: errorMessage,
          },
        });

        return false;
      }

      // Terminal failure:
      await tx.emailSend.update({
        where: { id: emailSendId },
        data: {
          status: EmailSendStatus.FAILED,
          failedAt: now,
          errorCode: 'PROVIDER_FAILURE',
          errorMessage,
        },
      });

      await tx.campaignContact.update({
        where: { id: campaignContactId },
        data: { status: CampaignContactStatus.FAILED },
      });

      await tx.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          failedAt: now,
          lastError: errorMessage,
        },
      });

      return false;
    });
  }
}
