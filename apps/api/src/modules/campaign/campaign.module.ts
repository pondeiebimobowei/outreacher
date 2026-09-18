import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { CompanyModule } from '../company/company.module';
import { ContactModule } from '../contact/contact.module';
import { CAMPAIGN_REPOSITORY_TOKEN } from './domain/campaign.repository.interface';
import { PrismaCampaignRepository } from './infrastructure/prisma-campaign.repository';
import { CreateCampaignUseCase } from './application/create-campaign.use-case';
import { GetCampaignUseCase } from './application/get-campaign.use-case';
import { ListCampaignsUseCase } from './application/list-campaigns.use-case';
import { AddCampaignContactsUseCase } from './application/add-campaign-contacts.use-case';
import { ChangeCampaignStatusUseCase } from './application/change-campaign-status.use-case';

@Module({
  imports: [PrismaModule, CompanyModule, ContactModule],
  providers: [
    {
      provide: CAMPAIGN_REPOSITORY_TOKEN,
      useClass: PrismaCampaignRepository,
    },
    CreateCampaignUseCase,
    GetCampaignUseCase,
    ListCampaignsUseCase,
    AddCampaignContactsUseCase,
    ChangeCampaignStatusUseCase,
  ],
  exports: [
    CAMPAIGN_REPOSITORY_TOKEN,
    CreateCampaignUseCase,
    GetCampaignUseCase,
    ListCampaignsUseCase,
    AddCampaignContactsUseCase,
    ChangeCampaignStatusUseCase,
  ],
})
export class CampaignModule {}
