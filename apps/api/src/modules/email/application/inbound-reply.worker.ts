import { Injectable, Logger, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { SECRET_RESOLVER_TOKEN } from '../domain/secret-resolver.interface';
import type { ISecretResolver } from '../domain/secret-resolver.interface';
import { INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN } from '../domain/inbound-email-content.adapter';
import type { IInboundEmailContentAdapterRegistry } from '../domain/inbound-email-content.adapter';
import { ReplyCorrelationService } from '../domain/reply-correlation.service';
import { InboundRetrievalException } from '../infrastructure/resend-inbound-content.adapter';

@Injectable()
export class InboundReplyWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(InboundReplyWorker.name);
  private isRunning = false;
  private readonly BATCH_SIZE = 5;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRET_RESOLVER_TOKEN) private readonly secretResolver: ISecretResolver,
    @Inject(INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN) private readonly adapterRegistry: IInboundEmailContentAdapterRegistry,
    private readonly correlationService: ReplyCorrelationService
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
    const jobs = await this.prisma.$queryRaw<any[]>`
      UPDATE jobs
      SET 
        status = 'RUNNING',
        "leaseVersion" = "leaseVersion" + 1,
        "attempt_count" = "attempt_count" + 1,
        "started_at" = NOW(),
        "updated_at" = NOW()
      WHERE id IN (
        SELECT id
        FROM jobs
        WHERE type = 'WEBHOOK_PROCESSING'
          AND status = 'PENDING'
          AND (available_at IS NULL OR available_at <= NOW())
        ORDER BY "created_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.BATCH_SIZE}
      )
      RETURNING *;
    `;

    if (jobs.length === 0) return 0;

    await Promise.allSettled(jobs.map(job => this.processJob(job)));
    return jobs.length;
  }

  private async processJob(job: any) {
    try {
      const payload = job.payload as { inboundReplyId: string; integrationId?: string };
      if (!payload || !payload.inboundReplyId) {
        throw new Error('Invalid job payload: missing inboundReplyId');
      }

      const inboundReply = await this.prisma.inboundReply.findUnique({
        where: { id: payload.inboundReplyId }
      });

      if (!inboundReply) {
        throw new Error(`InboundReply ${payload.inboundReplyId} not found`);
      }

      if (!inboundReply.providerEmailId) {
        throw new Error(`InboundReply ${payload.inboundReplyId} has no providerEmailId`);
      }

      // Load integration
      let integration;
      if (payload.integrationId) {
        integration = await this.prisma.integration.findUnique({
          where: { id: payload.integrationId }
        });
      } else {
        integration = await this.prisma.integration.findFirst({
          where: {
            workspaceId: inboundReply.workspaceId,
            provider: inboundReply.provider as any
          }
        });
      }

      if (!integration || !integration.secretReference) {
        throw new Error(`Integration not found or missing provider secret`);
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

      // DB Transaction
      await this.prisma.$transaction(async (tx: any) => {
        // Optimistic concurrency on job
        const updatedJob = await tx.job.update({
          where: { id: job.id, leaseVersion: job.leaseVersion },
          data: { status: 'COMPLETED', updatedAt: new Date(), completedAt: new Date() }
        });

        // Tenant safety check - although correlation already scopes by workspaceId, we double check
        if (correlation.status === 'CORRELATED') {
           const contact = await tx.campaignContact.findUnique({
             where: { id: correlation.campaignContactId }
           });
           if (!contact || contact.workspaceId !== inboundReply.workspaceId) {
             throw new Error('Tenant safety violation: Correlated CampaignContact belongs to different workspace');
           }
        }

        await tx.inboundReply.update({
          where: { id: inboundReply.id },
          data: {
            bodyText: retrieved.text,
            bodyHtml: retrieved.html,
            inReplyTo: retrieved.inReplyTo,
            references: retrieved.references,
            status: correlation.status,
            campaignContactId: correlation.status === 'CORRELATED' ? correlation.campaignContactId : null,
          }
        });
      });

    } catch (err: any) {
      this.logger.error(`Failed to process WEBHOOK_PROCESSING job ${job.id}`, err);

      let isRetryable = false;
      if (err instanceof InboundRetrievalException) {
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
