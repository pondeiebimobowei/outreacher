import { Injectable, Inject, RawBodyRequest, Logger } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../../database/prisma.service';
import { SECRET_RESOLVER_TOKEN } from '../domain/secret-resolver.interface';
import type { ISecretResolver } from '../domain/secret-resolver.interface';
import { ResendInboundEmailAdapter } from '../infrastructure/resend-inbound-email.adapter';
import { AppValidationException, AppNotFoundException } from '../../../common/errors/application.exception';
import { WebhookCredentials } from '../domain/provider-credentials';

@Injectable()
export class InboundWebhookService {
  private readonly logger = new Logger(InboundWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRET_RESOLVER_TOKEN) private readonly secretResolver: ISecretResolver,
    private readonly resendAdapter: ResendInboundEmailAdapter,
  ) {}

  async handleInbound(integrationId: string, req: RawBodyRequest<Request>) {
    if (!req.rawBody) {
      throw new AppValidationException('Raw body is missing');
    }

    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
    });

    if (!integration) {
      throw new AppNotFoundException('Integration not found');
    }

    if (integration.provider !== 'RESEND') {
      throw new AppValidationException(`Provider ${integration.provider} is not supported for inbound webhooks in this adapter`);
    }

    const webhookSecretRef = integration.webhookSecretReference;
    if (!webhookSecretRef) {
      throw new AppValidationException('Integration is not configured for inbound webhooks');
    }

    const credentials = (await this.secretResolver.resolve(
      integration.workspaceId,
      webhookSecretRef,
      'WEBHOOK'
    )) as WebhookCredentials;

    const adapter = this.resendAdapter;

    // 1. Verify signature
    adapter.verifySignature({
      rawBody: req.rawBody,
      headers: req.headers as Record<string, string>,
      secret: credentials.secret,
    });

    // 2. Parse payload
    const canonicalPayload = adapter.parsePayload(req.rawBody, req.headers as Record<string, string>);

    const idempotencyKey = `webhook:${integration.provider}:${canonicalPayload.providerEventId}`;

    // 3. Persist and Queue in one transaction
    try {
      await this.prisma.$transaction(async (tx: any) => {
        // 3.1 Insert InboundReply
        const reply = await tx.inboundReply.create({
          data: {
            workspaceId: integration.workspaceId,
            provider: integration.provider,
            providerEventId: canonicalPayload.providerEventId,
            providerEmailId: canonicalPayload.providerEmailId,
            messageId: canonicalPayload.messageId,
            inReplyTo: canonicalPayload.inReplyTo,
            references: canonicalPayload.references,
            replyToToken: canonicalPayload.replyToToken,
            fromEmail: canonicalPayload.fromEmail,
            fromName: canonicalPayload.fromName,
            toEmail: canonicalPayload.toEmail,
            subject: canonicalPayload.subject,
            bodyText: canonicalPayload.bodyText,
            bodyHtml: canonicalPayload.bodyHtml,
            receivedAt: canonicalPayload.receivedAt,
            status: 'UNCORRELATED',
          },
        });

        // 3.2 Create Job for 10C
        await tx.job.create({
          data: {
            workspaceId: integration.workspaceId,
            type: 'WEBHOOK_PROCESSING',
            idempotencyKey: idempotencyKey,
            payload: { inboundReplyId: reply.id },
          },
        });

        // 3.3 Ensure idempotency
        await tx.idempotencyRecord.create({
          data: {
            workspaceId: integration.workspaceId,
            key: idempotencyKey,
            route: 'webhook:inbound',
            targetId: reply.id,
            responseStatus: 202,
            responseBody: { accepted: true },
          }
        });
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        
        const target = err.meta?.target;
        // Check if the unique constraint violation is on the idempotency record key or inbound reply unique constraint
        const targetStr = Array.isArray(target) ? target.join(',') : String(target || '');
        const errMessage = err.message || '';
        if (
          targetStr.includes('key') || 
          targetStr.includes('providerEventId') || 
          targetStr.includes('provider_event_id') ||
          errMessage.includes('inbound_replies_workspace_id_provider_provider_event_id_key') ||
          errMessage.includes('idempotency_records')
        ) {
          this.logger.log(`Idempotent webhook deduplication for providerEventId: ${canonicalPayload.providerEventId}`);
          return;
        }
      }
      throw err;
    }
  }
}
