import { Module, Provider } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { SUPPRESSION_CHECKER_TOKEN } from './domain/suppression-checker.interface';
import { PrismaSuppressionChecker } from './infrastructure/prisma-suppression-checker';
import { EMAIL_SEND_REPOSITORY_TOKEN } from './domain/email-send.repository.interface';
import { PrismaEmailSendRepository } from './infrastructure/prisma-email-send.repository';
import { IDEMPOTENCY_REPOSITORY_TOKEN } from './domain/idempotency.repository.interface';
import { PrismaIdempotencyRepository } from './infrastructure/prisma-idempotency.repository';
import { SendEligibilityService } from './domain/send-eligibility.service';
import { EMAIL_SENDER_TOKEN } from './domain/email-sender.interface';
import { MockEmailSender } from './infrastructure/mock-email-sender';
import { ResendEmailSender } from './infrastructure/resend-email-sender';
import { SendEmailUseCase } from './application/send-email.use-case';
import { EmailDispatchWorker } from './application/email-dispatch.worker';
import { EmailController } from './email.controller';

const emailSenderFactory: Provider = {
  provide: EMAIL_SENDER_TOKEN,
  useFactory: () => {
    const providerName = (process.env.EMAIL_PROVIDER || '').toUpperCase();
    const env = process.env.NODE_ENV;

    if (
      providerName === 'MOCK' ||
      env === 'test' ||
      (!providerName && env !== 'production')
    ) {
      return new MockEmailSender();
    }

    if (providerName === 'RESEND') {
      return new ResendEmailSender();
    }

    throw new Error(
      `Invalid EMAIL_PROVIDER configuration: "${process.env.EMAIL_PROVIDER}". Must be "MOCK" or "RESEND".`,
    );
  },
};

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
    SendEligibilityService,
    emailSenderFactory,
    SendEmailUseCase,
    EmailDispatchWorker,
  ],
  exports: [
    SendEligibilityService,
    SendEmailUseCase,
    EmailDispatchWorker,
    EMAIL_SENDER_TOKEN,
    SUPPRESSION_CHECKER_TOKEN,
    EMAIL_SEND_REPOSITORY_TOKEN,
    IDEMPOTENCY_REPOSITORY_TOKEN,
  ],
})
export class EmailModule {}
