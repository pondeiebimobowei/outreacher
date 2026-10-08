import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { CompanyModule } from '../company/company.module';
import { ContactModule } from '../contact/contact.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { TemplateModule } from '../template/template.module';
import { EmailModule } from '../email/email.module';
import { CampaignController } from './campaign.controller';
import { CAMPAIGN_REPOSITORY_TOKEN } from './domain/campaign.repository.interface';
import { PrismaCampaignRepository } from './infrastructure/prisma-campaign.repository';
import { CreateCampaignUseCase } from './application/create-campaign.use-case';
import { UpdateCampaignUseCase } from './application/update-campaign.use-case';
import { AddCampaignRecipientsUseCase } from './application/add-campaign-recipients.use-case';
import { GetCampaignUseCase } from './application/get-campaign.use-case';
import { ListCampaignsUseCase } from './application/list-campaigns.use-case';
import { ChangeCampaignStatusUseCase } from './application/change-campaign-status.use-case';
import { ResumeCampaignRecipientUseCase } from './application/resume-campaign-recipient.use-case';
import { GetCampaignRecipientsUseCase } from './application/get-campaign-recipients.use-case';

@Module({
  imports: [
    PrismaModule,
    CompanyModule,
    ContactModule,
    WorkspaceModule,
    TemplateModule,
    EmailModule,
  ],
  controllers: [CampaignController],
  providers: [
    {
      provide: CAMPAIGN_REPOSITORY_TOKEN,
      useClass: PrismaCampaignRepository,
    },
    CreateCampaignUseCase,
    UpdateCampaignUseCase,
    AddCampaignRecipientsUseCase,
    GetCampaignUseCase,
    ListCampaignsUseCase,
    ChangeCampaignStatusUseCase,
    ResumeCampaignRecipientUseCase,
    GetCampaignRecipientsUseCase,
  ],
  exports: [
    CAMPAIGN_REPOSITORY_TOKEN,
    CreateCampaignUseCase,
    UpdateCampaignUseCase,
    AddCampaignRecipientsUseCase,
    GetCampaignUseCase,
    ListCampaignsUseCase,
    ChangeCampaignStatusUseCase,
    ResumeCampaignRecipientUseCase,
    GetCampaignRecipientsUseCase,
  ],
})
export class CampaignModule {}
