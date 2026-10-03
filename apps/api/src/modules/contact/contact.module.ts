import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../database/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { CreateContactUseCase } from './application/create-contact.use-case';
import { DiscoverContactsUseCase } from './application/discover-contacts.use-case';
import { GetCompanyContactsUseCase } from './application/get-company-contacts.use-case';
import { GetContactByIdUseCase } from './application/get-contact-by-id.use-case';
import { SelectContactUseCase } from './application/select-contact.use-case';
import { SuppressContactUseCase } from './application/suppress-contact.use-case';
import { UnsuppressContactUseCase } from './application/unsuppress-contact.use-case';
import { ContactController } from './contact.controller';
import { CONTACT_DISCOVERY_PROVIDER_TOKEN } from './domain/contact.provider.interface';
import { CONTACT_REPOSITORY_TOKEN } from './domain/contact.repository.interface';
import { HttpContactDiscoveryAdapter } from './infrastructure/http-contact-discovery.adapter';
import { MockContactDiscoveryProvider } from './infrastructure/mock-contact-discovery.provider';
import { PrismaContactRepository } from './infrastructure/prisma-contact.repository';
import { ContactDiscoveryWorker } from './worker/contact-discovery.worker';
import { ContactDiscoveryWorkerRunner } from './worker/contact-discovery-worker.runner';

@Module({
  imports: [PrismaModule, WorkspaceModule, ConfigModule],
  controllers: [ContactController],
  providers: [
    {
      provide: CONTACT_REPOSITORY_TOKEN,
      useClass: PrismaContactRepository,
    },
    {
      provide: CONTACT_DISCOVERY_PROVIDER_TOKEN,
      useFactory: (configService: ConfigService) => {
        const providerType = configService.get<string>('CONTACT_PROVIDER');
        if (providerType === 'HTTP') {
          return new HttpContactDiscoveryAdapter(configService);
        }
        return new MockContactDiscoveryProvider();
      },
      inject: [ConfigService],
    },
    CreateContactUseCase,
    DiscoverContactsUseCase,
    GetCompanyContactsUseCase,
    GetContactByIdUseCase,
    SelectContactUseCase,
    SuppressContactUseCase,
    UnsuppressContactUseCase,
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
    SuppressContactUseCase,
    UnsuppressContactUseCase,
    ContactDiscoveryWorker,
    ContactDiscoveryWorkerRunner,
  ],
})
export class ContactModule {}
