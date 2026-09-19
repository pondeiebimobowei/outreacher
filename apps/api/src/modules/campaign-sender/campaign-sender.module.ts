import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { AssignCampaignSendersUseCase } from './application/assign-campaign-senders.use-case';
import { ListCampaignSendersUseCase } from './application/list-campaign-senders.use-case';
import { CampaignSenderController } from './campaign-sender.controller';

@Module({
  imports: [PrismaModule, WorkspaceModule],
  controllers: [CampaignSenderController],
  providers: [
    AssignCampaignSendersUseCase,
    ListCampaignSendersUseCase,
  ],
})
export class CampaignSenderModule {}
