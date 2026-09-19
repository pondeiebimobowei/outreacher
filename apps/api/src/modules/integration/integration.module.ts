import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { EmailModule } from '../email/email.module';

import { CONNECTION_TESTER_REGISTRY_TOKEN } from './domain/connection-tester.interface';
import { ResendConnectionTester } from './infrastructure/resend-connection-tester';
import { ConnectionTesterRegistry } from './infrastructure/connection-tester.registry';

import { CreateIntegrationUseCase } from './application/create-integration.use-case';
import { ListIntegrationsUseCase } from './application/list-integrations.use-case';
import { GetIntegrationUseCase } from './application/get-integration.use-case';
import { TestIntegrationUseCase } from './application/test-integration.use-case';
import { EnableIntegrationUseCase } from './application/enable-integration.use-case';
import { DisableIntegrationUseCase } from './application/disable-integration.use-case';

import { IntegrationController } from './integration.controller';

@Module({
  imports: [PrismaModule, WorkspaceModule, EmailModule],
  controllers: [IntegrationController],
  providers: [
    ResendConnectionTester,
    {
      provide: CONNECTION_TESTER_REGISTRY_TOKEN,
      useClass: ConnectionTesterRegistry,
    },
    CreateIntegrationUseCase,
    ListIntegrationsUseCase,
    GetIntegrationUseCase,
    TestIntegrationUseCase,
    EnableIntegrationUseCase,
    DisableIntegrationUseCase,
  ],
})
export class IntegrationModule {}
