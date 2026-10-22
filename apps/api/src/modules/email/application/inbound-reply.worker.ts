import { Injectable, Logger, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { SECRET_RESOLVER_TOKEN } from '../domain/secret-resolver.interface';
import type { ISecretResolver } from '../domain/secret-resolver.interface';
import { INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN } from '../domain/inbound-email-content.adapter';
import type { IInboundEmailContentAdapterRegistry } from '../domain/inbound-email-content.adapter';
import { ReplyCorrelationService } from '../domain/reply-correlation.service';
import { InboundRetrievalException } from '../infrastructure/resend-inbound-content.adapter';
import { Prisma } from '@repo/db';
import { MarkContactRepliedUseCase, ContactStateTransitionException } from './mark-contact-replied.use-case';


@Injectable()
export class InboundReplyWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(InboundReplyWorker.name);
  private isRunning = false;
  private readonly BATCH_SIZE = 5;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRET_RESOLVER_TOKEN) private readonly secretResolver: ISecretResolver,
    @Inject(INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN) private readonly adapterRegistry: IInboundEmailContentAdapterRegistry,
    private readonly correlationService: ReplyCorrelationService,
    private readonly markContactRepliedUseCase: MarkContactRepliedUseCase
  ) {}

  onApplicationBootstrap() {
    this.isRunning = true;
    this.poll();
    this.recoverStaleJobs();
  }

  async poll() {
    if (!this.isRunning) return;

    try {
      const processed = await this.claimAndProcessJobs();
      if (processed === 0) {
        setTimeout(() => this.poll(), 2000);
      } else {
        setImmediate(() => this.poll());
      }
    } catch (err) {
      this.logger.error('Error in InboundReplyWorker poll', err);
      setTimeout(() => this.poll(), 5000);
    }
  }

  async recoverStaleJobs() {
    if (!this.isRunning) return;

    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = await this.prisma.job.updateMany({
        where: {
          type: 'WEBHOOK_PROCESSING',
          status: 'RUNNING',
          updatedAt: { lt: fiveMinutesAgo }
        },
        data: {
          status: 'PENDING',
          leaseVersion: { increment: 1 }
        }
      });
      if (result.count > 0) {
        this.logger.log(`Recovered ${result.count} stale WEBHOOK_PROCESSING jobs`);
      }
    } catch (err) {
      this.logger.error('Error recovering stale jobs', err);
    }

    setTimeout(() => this.recoverStaleJobs(), 60000);
  }

  private async claimAndProcessJobs(): Promise<number> {
    const jobs: [] = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const eligible = await tx.$queryRaw<Array<{ id: string; attempt_count: number }>>`
        SELECT id, attempt_count
        FROM jobs
        WHERE type = 'WEBHOOK_PROCESSING'::"JobType"
          AND status = 'PENDING'::"JobStatus"
          AND (available_at IS NULL OR available_at <= ${new Date()})
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.BATCH_SIZE}
      `;

      if (!eligible || eligible.length === 0) return [];

      const updatedJobs = [];
      const now = new Date();
      for (const row of eligible) {
        const updated = await tx.job.update({
          where: { id: row.id },
          data: {
            status: 'RUNNING',
            attemptCount: row.attempt_count + 1,
            startedAt: now,
            leaseVersion: { increment: 1 }
          }
        });
        updatedJobs.push(updated);
      }
      return updatedJobs as [];
    });

    if (jobs.length === 0) return 0;

    await Promise.allSettled(jobs.map(job => this.processJob(job)));
    return jobs.length;
  }

  private async processJob(job: any) {
    try {
      const payload = job.payload as { inboundReplyId: string; integrationId: string };
      if (!payload || !payload.inboundReplyId || !payload.integrationId) {
        throw new Error('Invalid job payload: missing inboundReplyId or integrationId');
      }

      const inboundReply = await this.prisma.inboundReply.findUnique({
        where: { id: payload.inboundReplyId }
      });

      if (!inboundReply) {
        throw new Error(`InboundReply ${payload.inboundReplyId} not found`);
      }
      if (inboundReply.workspaceId !== job.workspaceId) {
        throw new Error(`Tenant mismatch: Job workspace ${job.workspaceId} != InboundReply workspace ${inboundReply.workspaceId}`);
      }
      if (!inboundReply.providerEmailId) {
        throw new Error(`InboundReply ${payload.inboundReplyId} has no providerEmailId`);
      }

      // Load integration directly by ID (no fallback)
      const integration = await this.prisma.integration.findUnique({
        where: { id: payload.integrationId }
      });

      if (!integration) {
        throw new Error(`Integration ${payload.integrationId} not found`);
      }
      if (integration.workspaceId !== inboundReply.workspaceId) {
        throw new Error(`Tenant mismatch: Integration workspace ${integration.workspaceId} != InboundReply workspace ${inboundReply.workspaceId}`);
      }
      if (integration.provider !== inboundReply.provider) {
        throw new Error(`Provider mismatch: Integration provider ${integration.provider} != InboundReply provider ${inboundReply.provider}`);
      }
      if (!integration.secretReference) {
        throw new Error(`Integration missing provider secret`);
      }

            const apiCredentials = await this.secretResolver.resolve(
        integration.workspaceId,
        integration.secretReference,
        'PROVIDER'
      );

      // Get adapter
      const adapter = this.adapterRegistry.getAdapter(integration.provider);

      // Retrieve content
      const retrieved = await adapter.getEmailDetails(inboundReply.providerEmailId, apiCredentials as any);

      // Consistency checks
      if (retrieved.providerEmailId !== inboundReply.providerEmailId) {
         throw new Error(`Data integrity error: retrieved providerEmailId ${retrieved.providerEmailId} != original ${inboundReply.providerEmailId}`);
      }

      if (inboundReply.messageId && retrieved.messageId && retrieved.messageId !== inboundReply.messageId) {
         throw new Error(`Data integrity error: retrieved messageId ${retrieved.messageId} != original ${inboundReply.messageId}`);
      }

      // Correlate
      const correlation = await this.correlationService.correlate(
        inboundReply,
        inboundReply.toEmail,
        retrieved.inReplyTo,
        retrieved.references
      );

      // 10C Transaction
      await this.prisma.$transaction(async (tx: any) => {
        // Tenant safety check - although correlation already scopes by workspaceId, we double check
        if (correlation.status === 'CORRELATED') {
           if (correlation.campaignMemberId) {
             const contact = await tx.campaignMember.findUnique({
               where: { id: correlation.campaignMemberId }
             });
             if (!contact || contact.workspaceId !== inboundReply.workspaceId) {
               throw new Error('Tenant safety violation: Correlated CampaignMember belongs to different workspace');
             }
           }
           if (correlation.outreachId) {
             const outreach = await tx.outreach.findUnique({
               where: { id: correlation.outreachId }
             });
             if (!outreach || outreach.workspaceId !== inboundReply.workspaceId) {
               throw new Error('Tenant safety violation: Correlated Outreach belongs to different workspace');
             }
           }
        }

        await tx.inboundReply.update({
          where: { id: inboundReply.id },
          data: {
            providerEmailId: retrieved.providerEmailId,
            messageId: retrieved.messageId || inboundReply.messageId,
            bodyText: retrieved.text,
            bodyHtml: retrieved.html,
            inReplyTo: retrieved.inReplyTo,
            references: retrieved.references,
            status: correlation.status,
            campaignMemberId: correlation.status === 'CORRELATED' ? correlation.campaignMemberId : null,
            outreachId: correlation.status === 'CORRELATED' ? correlation.outreachId : null,
            campaignId: correlation.status === 'CORRELATED' ? correlation.campaignId : null,
          }
        });

        if (correlation.status === 'CORRELATED' && correlation.outreachId) {
          await tx.conversationMessage.create({
            data: {
              workspaceId: inboundReply.workspaceId,
              outreachId: correlation.outreachId,
              kind: 'INBOUND',
              subject: inboundReply.subject || '',
              body: retrieved.text || retrieved.html || '',
            }
          });
        }
      });

      // 10D Transaction
      if (correlation.status === 'CORRELATED' && correlation.campaignMemberId) {
        await this.markContactRepliedUseCase.execute(correlation.campaignMemberId, inboundReply.workspaceId);
      }

      // Completion Transaction
      await this.prisma.job.update({
        where: { id: job.id, leaseVersion: job.leaseVersion },
        data: { status: 'COMPLETED', updatedAt: new Date(), completedAt: new Date() }
      });

    } catch (err: any) {
      this.logger.error(`Failed to process WEBHOOK_PROCESSING job ${job.id}`, err);

      let isRetryable = false;
      if (err instanceof InboundRetrievalException) {
        isRetryable = err.isRetryable;
      } else if (err instanceof ContactStateTransitionException) {
        isRetryable = err.isRetryable;
      } else if (err.code && err.code !== 'P2025') {
        // Unexpected errors (DB timeouts etc.) are usually retryable
        isRetryable = true;
      }

      // If missing payload or tenant violation, not retryable
      if (err.message?.includes('Invalid job payload') || err.message?.includes('Tenant safety violation') || err.message?.includes('Data integrity error')) {
        isRetryable = false;
      }

      const attempts = job.attemptCount;
      const maxAttempts = job.maxAttempts;
      
      const newStatus = (!isRetryable || attempts >= maxAttempts) ? 'DEAD_LETTER' : 'PENDING';
      const availableAt = newStatus === 'PENDING' 
        ? new Date(Date.now() + Math.pow(2, attempts) * 1000)
        : job.availableAt;

      try {
        await this.prisma.job.update({
          where: { id: job.id, leaseVersion: job.leaseVersion },
          data: {
            status: newStatus,
            failedAt: newStatus === 'DEAD_LETTER' ? new Date() : null,
            updatedAt: new Date(),
            availableAt,
            lastError: err.message
          }
        });
      } catch (updateErr) {
        this.logger.error(`Failed to mark job ${job.id} as ${newStatus}`, updateErr);
      }
    }
  }
}
