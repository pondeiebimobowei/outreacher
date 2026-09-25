import { Injectable, Inject, RawBodyRequest, Logger } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../../database/prisma.service';
import { SECRET_RESOLVER_TOKEN } from '../domain/secret-resolver.interface';
import type { ISecretResolver } from '../domain/secret-resolver.interface';
import { ResendDeliveryEventAdapter } from '../infrastructure/resend-delivery-event.adapter';
import {
  AppValidationException,
  AppNotFoundException,
} from '../../../common/errors/application.exception';
import { WebhookCredentials } from '../domain/provider-credentials';
import { ProcessDeliveryEventUseCase } from './process-delivery-event.use-case';

@Injectable()
export class DeliveryWebhookService {
  private readonly logger = new Logger(DeliveryWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SECRET_RESOLVER_TOKEN)
    private readonly secretResolver: ISecretResolver,
    private readonly resendAdapter: ResendDeliveryEventAdapter,
    private readonly processDeliveryEvent: ProcessDeliveryEventUseCase,
  ) {}

  async handleDelivery(integrationId: string, req: RawBodyRequest<Request>) {
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
      throw new AppValidationException(
        `Provider ${integration.provider} is not supported for delivery webhooks in this adapter`,
      );
    }

    const webhookSecretRef = integration.webhookSecretReference;
    if (!webhookSecretRef) {
      throw new AppValidationException(
        'Integration is not configured for webhooks',
      );
    }

    const credentials = (await this.secretResolver.resolve(
      integration.workspaceId,
      webhookSecretRef,
      'WEBHOOK',
    )) as WebhookCredentials;

    const adapter = this.resendAdapter;

    // 1. Verify signature
    adapter.verifySignature({
      rawBody: req.rawBody,
      headers: req.headers as Record<string, string>,
      secret: credentials.secret,
    });

    // 2. Parse payload
    const result = adapter.parsePayload(req.rawBody, req.headers);

    if (result.status === 'INVALID') {
      throw new AppValidationException(result.reason);
    }

    if (result.status === 'UNSUPPORTED') {
      this.logger.log(
        `Safely dropping unsupported webhook payload: ${result.reason}`,
      );
      return; // 202 Accepted
    }

    const { event } = result;
    const idempotencyKey = `webhook:delivery:${integration.provider}:${event.providerEventId}`;

    // 3. Process delivery event (correlation + idempotency + db insertion)
    await this.processDeliveryEvent.execute({
      workspaceId: integration.workspaceId,
      provider: integration.provider,
      idempotencyKey,
      event,
    });
  }
}
