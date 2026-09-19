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

import { SECRET_RESOLVER_TOKEN } from './domain/secret-resolver.interface';
import { SecretResolverService } from './infrastructure/secret-resolver.service';
import { EmailProviderRegistry } from './infrastructure/email-provider.registry';
import { ResendEmailProviderAdapter } from './infrastructure/resend-email-provider.adapter';
import { MockEmailProviderAdapter } from './infrastructure/mock-email-provider.adapter';

@Module({
  imports: [PrismaModule, WorkspaceModule],
  controllers: [EmailController],
  providers: [
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
    MockEmailProviderAdapter,
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
