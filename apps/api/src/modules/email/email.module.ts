import { MarkContactRepliedUseCase } from './application/mark-contact-replied.use-case';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { SUPPRESSION_CHECKER_TOKEN } from './domain/suppression-checker.interface';
import { PrismaSuppressionChecker } from './infrastructure/prisma-suppression-checker';
import { EMAIL_SEND_REPOSITORY_TOKEN } from './domain/email-send.repository.interface';
import { PrismaEmailSendRepository } from './infrastructure/prisma-email-send.repository';
import { IDEMPOTENCY_REPOSITORY_TOKEN } from './domain/idempotency.repository.interface';
import { PrismaIdempotencyRepository } from './infrastructure/prisma-idempotency.repository';
import { SendEligibilityService } from './domain/send-eligibility.service';
import { SendEmailUseCase } from './application/send-email.use-case';
import { EmailDispatchWorker } from './application/email-dispatch.worker';
import { EmailController } from './email.controller';
import { InboundWebhookController } from './application/inbound-webhook.controller';
import { InboundWebhookService } from './application/inbound-webhook.service';

import { SECRET_RESOLVER_TOKEN } from './domain/secret-resolver.interface';
import { SecretResolverService } from './infrastructure/secret-resolver.service';
import { EmailProviderRegistry } from './infrastructure/email-provider.registry';
import { ResendEmailProviderAdapter } from './infrastructure/resend-email-provider.adapter';
import { ResendInboundEmailAdapter } from './infrastructure/resend-inbound-email.adapter';
import { MockEmailProviderAdapter } from './infrastructure/mock-email-provider.adapter';
import { ResendInboundContentAdapter } from './infrastructure/resend-inbound-content.adapter';
import { ReplyCorrelationService } from './domain/reply-correlation.service';
import { InboundReplyWorker } from './application/inbound-reply.worker';
import { InboundEmailContentAdapterRegistry } from './infrastructure/inbound-email-content-adapter.registry';
import { DeliveryWebhookController } from './application/delivery-webhook.controller';
import { DeliveryWebhookService } from './application/delivery-webhook.service';
import { ProcessDeliveryEventUseCase } from './application/process-delivery-event.use-case';
import { ResendDeliveryEventAdapter } from './infrastructure/resend-delivery-event.adapter';

@Module({
  imports: [PrismaModule, WorkspaceModule],
  controllers: [EmailController, InboundWebhookController, DeliveryWebhookController],
  providers: [
    MarkContactRepliedUseCase,
    {
      provide: SUPPRESSION_CHECKER_TOKEN,
      useClass: PrismaSuppressionChecker,
    },
    {
      provide: EMAIL_SEND_REPOSITORY_TOKEN,
      useClass: PrismaEmailSendRepository,
    },
    {
      provide: IDEMPOTENCY_REPOSITORY_TOKEN,
      useClass: PrismaIdempotencyRepository,
    },
    {
      provide: SECRET_RESOLVER_TOKEN,
      useClass: SecretResolverService,
    },
    SendEligibilityService,
    SendEmailUseCase,
    EmailDispatchWorker,
    EmailProviderRegistry,
    ResendEmailProviderAdapter,
    ResendInboundEmailAdapter,
    InboundWebhookService,
    MockEmailProviderAdapter,
    ResendInboundContentAdapter,
    ReplyCorrelationService,
    InboundReplyWorker,
    DeliveryWebhookService,
    ProcessDeliveryEventUseCase,
    ResendDeliveryEventAdapter,
    {
      provide: 'INBOUND_EMAIL_CONTENT_ADAPTER_REGISTRY_TOKEN',
      useClass: InboundEmailContentAdapterRegistry,
    },
  ],
  exports: [
    SendEligibilityService,
    SendEmailUseCase,
    EmailDispatchWorker,
    SUPPRESSION_CHECKER_TOKEN,
    EMAIL_SEND_REPOSITORY_TOKEN,
    IDEMPOTENCY_REPOSITORY_TOKEN,
    SECRET_RESOLVER_TOKEN,
  ],
})
export class EmailModule {}
