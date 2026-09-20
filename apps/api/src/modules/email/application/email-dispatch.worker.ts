import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CampaignContactStatus,
  EmailSendStatus,
  Job,
  JobStatus,
  Prisma,
} from '@repo/db';
import { PrismaService } from '../../../database/prisma.service';
import { EmailProviderRegistry } from '../infrastructure/email-provider.registry';
import { SECRET_RESOLVER_TOKEN, type ISecretResolver } from '../domain/secret-resolver.interface';
import { SendEmailResult, EmailDispatchErrorCode } from '../domain/email-provider.adapter';
import { EmailProviderException } from '../infrastructure/resend-email-provider.adapter';

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
  ) {}

  /**
   * Claims an eligible PENDING email dispatch job using PostgreSQL FOR UPDATE SKIP LOCKED.
   */
  async claimNextJob(): Promise<ClaimedEmailJob | null> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const now = new Date();
      const eligibleJobs = await tx.$queryRaw<Array<{ id: string; attempt_count: number }>>`
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

      const payload = updatedJob.payload as Record<string, unknown> | null;
      const emailSendId = payload?.emailSendId as string | undefined;

      if (emailSendId) {
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

  public async recoverStaleJobs(): Promise<number> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = await this.prisma.job.updateMany({
      where: {
        type: 'EMAIL_DISPATCH',
        status: 'RUNNING',
        updatedAt: { lt: fiveMinutesAgo }
      },
      data: {
        status: 'PENDING',
        availableAt: new Date(),
        leaseVersion: { increment: 1 }
      }
    });
    return result.count;
  }

  async processJob(claimed: ClaimedEmailJob): Promise<boolean> {
    const { job, claimedAttempt } = claimed;
    const payload = job.payload as Record<string, unknown> | null;
    const emailSendId = payload?.emailSendId as string;
    const campaignContactId = payload?.campaignContactId as string;
    const workspaceId = job.workspaceId;

    let sendResult: SendEmailResult | null = null;
    let dispatchError: Error | null = null;
    let isUncertainTimeout = false;
    let isTransient = false;

    try {
      const emailSend = await this.prisma.emailSend.findUnique({
        where: { id: emailSendId },
        include: {
          senderAccount: {
            include: { integration: true }
          },
          campaignContact: {
            include: { contact: true, campaign: true },
          },
        },
      });

      if (!emailSend || emailSend.workspaceId !== workspaceId) {
        throw new Error(`EmailSend ${emailSendId} not found or tenant mismatch`);
      }
      
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
        throw new EmailProviderException(`Provider adapter not found for ${providerStr}`, EmailDispatchErrorCode.PROVIDER_UNSUPPORTED);
      }

      const credentials = await this.secretResolver.resolve(workspaceId, senderAccount.integration.secretReference, providerStr);

      const recipientEmail = emailSend.campaignContact?.contact?.email;
      if (!recipientEmail) throw new Error('Contact recipient email is missing');
      if (!emailSend.replyToToken) throw new Error('Opaque replyToToken is missing for EmailSend');

      const canonicalIdempotencyKey = `send:${emailSendId}`;

      sendResult = await adapter.sendEmail({
        workspaceId,
        senderAccountId: senderAccount.id,
        campaignContactId,
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
      this.logger.error(`Email dispatch failed for job ${job.id}: ${err?.message}`);
      dispatchError = err instanceof Error ? err : new Error(String(err));
      
      if (err instanceof EmailProviderException) {
        if (err.dispatchErrorCode === EmailDispatchErrorCode.PROVIDER_TIMEOUT_UNCERTAIN) {
          isUncertainTimeout = true;
        } else if (err.dispatchErrorCode === EmailDispatchErrorCode.PROVIDER_RATE_LIMIT || err.dispatchErrorCode === EmailDispatchErrorCode.PROVIDER_CONNECT_FAILURE) {
          isTransient = true;
        }
      } else {
        const errorMessage = dispatchError.message.toLowerCase();
        if (errorMessage.includes('timeout')) {
          isUncertainTimeout = true;
        } else if (errorMessage.includes('network') || errorMessage.includes('econnrefused')) {
          isTransient = true;
        }
      }
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const now = new Date();
      const errorMessage = dispatchError?.message || 'Unknown dispatch error';

      let jobUpdateData: any = {};
      
      if (sendResult) {
        jobUpdateData = { status: 'COMPLETED', completedAt: now };
      } else if (isUncertainTimeout) {
        jobUpdateData = { status: 'DEAD_LETTER', failedAt: now, lastError: errorMessage };
      } else if (isTransient && claimedAttempt < this.MAX_ATTEMPTS) {
        const backoffMs = Math.pow(2, claimedAttempt) * 10000;
        jobUpdateData = { status: 'PENDING', availableAt: new Date(now.getTime() + backoffMs), lastError: errorMessage };
      } else {
        jobUpdateData = { status: 'DEAD_LETTER', failedAt: now, lastError: errorMessage };
      }

      // Perform atomic fencing update on Job
      const leaseCheck = await tx.job.updateMany({
        where: { id: job.id, leaseVersion: job.leaseVersion, status: 'RUNNING' },
        data: jobUpdateData,
      });

      if (leaseCheck.count === 0) {
        this.logger.warn(`Job ${job.id} lease generation ${claimedAttempt} lost or reclaimed. Aborting state transition.`);
        return false;
      }

      // If we got here, the Job was successfully mutated and we own the lease lock. 
      // Now safe to mutate related entities.
      if (sendResult) {
        await tx.emailSend.update({
          where: { id: emailSendId },
          data: {
            status: 'SENT',
            providerMessageId: sendResult.providerMessageId,
            messageId: sendResult.messageId,
            sentAt: now,
          },
        });

        await tx.campaignContact.update({
          where: { id: campaignContactId },
          data: { status: 'SENT' },
        });
        
        return true;
      }
      
      if (isUncertainTimeout) {
        await tx.emailSend.update({
          where: { id: emailSendId },
          data: {
            status: 'FAILED',
            failedAt: now,
            errorCode: 'PROVIDER_TIMEOUT_UNCERTAIN',
            errorMessage,
            retryable: false,
          },
        });
        await tx.campaignContact.update({
          where: { id: campaignContactId },
          data: { status: 'FAILED' },
        });
        return false;
      }
      
      if (isTransient && claimedAttempt < this.MAX_ATTEMPTS) {
        return false;
      }

      let finalErrorCode = 'DISPATCH_ATTEMPTS_EXHAUSTED';
      if (dispatchError && 'dispatchErrorCode' in dispatchError) {
        if (dispatchError.dispatchErrorCode !== 'PROVIDER_RATE_LIMIT' && dispatchError.dispatchErrorCode !== 'PROVIDER_CONNECT_FAILURE') {
          finalErrorCode = dispatchError.dispatchErrorCode as string;
        }
      }

      await tx.emailSend.update({
        where: { id: emailSendId },
        data: {
          status: 'FAILED',
          failedAt: now,
          errorCode: finalErrorCode as any,
          errorMessage,
          retryable: false,
        },
      });

      await tx.campaignContact.update({
        where: { id: campaignContactId },
        data: { status: 'FAILED' },
      });

      return false;
    });
  }
}
