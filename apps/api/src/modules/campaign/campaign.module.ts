import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { CompanyModule } from '../company/company.module';
import { CAMPAIGN_REPOSITORY_TOKEN } from './domain/campaign.repository.interface';
import { PrismaCampaignRepository } from './infrastructure/prisma-campaign.repository';
import { CreateCampaignUseCase } from './application/create-campaign.use-case';
import { GetCampaignUseCase } from './application/get-campaign.use-case';
import { ListCampaignsUseCase } from './application/list-campaigns.use-case';

@Module({
  imports: [PrismaModule, CompanyModule],
  providers: [
    {
      provide: CAMPAIGN_REPOSITORY_TOKEN,
      useClass: PrismaCampaignRepository,
    },
    CreateCampaignUseCase,
    GetCampaignUseCase,
    ListCampaignsUseCase,
  ],
  exports: [
    CAMPAIGN_REPOSITORY_TOKEN,
    CreateCampaignUseCase,
    GetCampaignUseCase,
    ListCampaignsUseCase,
  ],
})
export class CampaignModule {}
