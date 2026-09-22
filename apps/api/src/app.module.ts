import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CsrfGuard } from './common/guards/csrf.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { validateEnv } from './config/env.config';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { WorkspaceModule } from './modules/workspaces/workspace.module';
import { CompanyModule } from './modules/company/company.module';
import { ResearchModule } from './modules/research/research.module';
import { ContactModule } from './modules/contact/contact.module';
import { OutreachModule } from './modules/outreach/outreach.module';
import { CampaignModule } from './modules/campaign/campaign.module';
import { EmailModule } from './modules/email/email.module';
import { IntegrationModule } from './modules/integration/integration.module';
import { SenderAccountModule } from './modules/sender-account/sender-account.module';
import { CampaignSenderModule } from './modules/campaign-sender/campaign-sender.module';
import { WorkspaceSummaryModule } from './modules/workspace-summary/workspace-summary.module';
import { OutcomeModule } from './modules/outcome/outcome.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    WorkspaceModule,
    ProfileModule,
    CompanyModule,
    ResearchModule,
    ContactModule,
    OutreachModule,
    CampaignModule,
    EmailModule,
    IntegrationModule,
    SenderAccountModule,
    CampaignSenderModule,
    WorkspaceSummaryModule,
    OutcomeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
