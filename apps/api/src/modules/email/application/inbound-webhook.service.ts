import { Injectable, Inject, RawBodyRequest, Logger } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../../database/prisma.service';
import { SECRET_RESOLVER_TOKEN, type ISecretResolver } from '../domain/secret-resolver.interface';
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

    let webhookSecretRef = '';
    if (integration.metadata && typeof integration.metadata === 'object' && 'webhookSecretReference' in integration.metadata) {
      webhookSecretRef = (integration.metadata as any).webhookSecretReference as string;
    }

    if (!webhookSecretRef) {
      throw new AppValidationException('Integration is not configured for inbound webhooks');
    }

    const credentials = (await this.secretResolver.resolve(
      integration.workspaceId,
      webhookSecretRef,
      'WEBHOOK'
    )) as WebhookCredentials;

    const adapter = this.resendAdapter; // in future, select by integration.provider

    // 1. Verify signature
    adapter.verifySignature({
      rawBody: req.rawBody,
      headers: req.headers as Record<string, string>,
      secret: credentials.secret,
    });

    // 2. Parse payload
    const canonicalPayload = adapter.parsePayload(req.rawBody);

    // If no provider message ID, generate a synthetic one for idempotency
    const providerMsgId = canonicalPayload.providerMessageId || `synthetic_${Date.now()}_${Math.random()}`;

    // 3. Persist and Queue in one transaction
    try {
      await this.prisma.$transaction(async (tx) => {
        // 3.1 Insert InboundReply
        const reply = await tx.inboundReply.create({
          data: {
            workspaceId: integration.workspaceId,
            providerMessageId: providerMsgId,
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
            type: 'PROCESS_INBOUND_REPLY',
            payload: { inboundReplyId: reply.id },
          },
        });

        // 3.3 Ensure idempotency
        const idempotencyKey = `webhook_inbound_${providerMsgId}`;
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
        this.logger.log(`Idempotent webhook deduplication for providerMessageId: ${providerMsgId}`);
        return; // gracefully accept duplicate
      }
      throw err;
    }
  }
}
