import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { CreateContactUseCase } from './application/create-contact.use-case';
import { DiscoverContactsUseCase } from './application/discover-contacts.use-case';
import { GetCompanyContactsUseCase } from './application/get-company-contacts.use-case';
import { GetContactByIdUseCase } from './application/get-contact-by-id.use-case';
import { SelectContactUseCase } from './application/select-contact.use-case';
import { ContactController } from './contact.controller';
import { CONTACT_DISCOVERY_PROVIDER_TOKEN } from './domain/contact.provider.interface';
import { CONTACT_REPOSITORY_TOKEN } from './domain/contact.repository.interface';
import { MockContactDiscoveryProvider } from './infrastructure/mock-contact-discovery.provider';
import { PrismaContactRepository } from './infrastructure/prisma-contact.repository';
import { ContactDiscoveryWorker } from './worker/contact-discovery.worker';
import { ContactDiscoveryWorkerRunner } from './worker/contact-discovery-worker.runner';

@Module({
  imports: [PrismaModule, WorkspaceModule],
  controllers: [ContactController],
  providers: [
    {
      provide: CONTACT_REPOSITORY_TOKEN,
      useClass: PrismaContactRepository,
    },
    {
      provide: CONTACT_DISCOVERY_PROVIDER_TOKEN,
      useClass: MockContactDiscoveryProvider,
    },
    CreateContactUseCase,
    DiscoverContactsUseCase,
    GetCompanyContactsUseCase,
    GetContactByIdUseCase,
    SelectContactUseCase,
    ContactDiscoveryWorker,
    ContactDiscoveryWorkerRunner,
  ],
  exports: [
    CONTACT_REPOSITORY_TOKEN,
    CONTACT_DISCOVERY_PROVIDER_TOKEN,
    CreateContactUseCase,
    GetCompanyContactsUseCase,
    GetContactByIdUseCase,
    SelectContactUseCase,
    ContactDiscoveryWorker,
    ContactDiscoveryWorkerRunner,
  ],
  exports: [
    CONTACT_REPOSITORY_TOKEN,
    CONTACT_DISCOVERY_PROVIDER_TOKEN,
    DiscoverContactsUseCase,
    GetCompanyContactsUseCase,
    GetContactByIdUseCase,
    SelectContactUseCase,
    ContactDiscoveryWorker,
  ],
})
export class ContactModule {}
