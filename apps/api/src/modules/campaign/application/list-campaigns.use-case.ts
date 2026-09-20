import { Inject, Injectable } from '@nestjs/common';
import { Campaign } from '@repo/db';
import { CampaignWithSenders } from '../domain/campaign.repository.interface';
import {
  CAMPAIGN_REPOSITORY_TOKEN,
  type ICampaignRepository,
} from '../domain/campaign.repository.interface';

@Injectable()
export class ListCampaignsUseCase {
  constructor(
    @Inject(CAMPAIGN_REPOSITORY_TOKEN)
    private readonly campaignRepository: ICampaignRepository,
  ) {}

  async execute(workspaceId: string): Promise<CampaignWithSenders[]> {
    return this.campaignRepository.findManyByWorkspace(workspaceId);
  }
}
