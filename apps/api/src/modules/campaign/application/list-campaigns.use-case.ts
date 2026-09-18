import { Inject, Injectable } from '@nestjs/common';
import { Campaign } from '@repo/db';
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

  async execute(workspaceId: string): Promise<Campaign[]> {
    return this.campaignRepository.findManyByWorkspace(workspaceId);
  }
}
