import { Inject, Injectable } from '@nestjs/common';
import { Campaign } from '@repo/db';
import { AppNotFoundException } from '../../../common/errors/application.exception';
import {
  CAMPAIGN_REPOSITORY_TOKEN,
  type ICampaignRepository,
} from '../domain/campaign.repository.interface';

@Injectable()
export class GetCampaignUseCase {
  constructor(
    @Inject(CAMPAIGN_REPOSITORY_TOKEN)
    private readonly campaignRepository: ICampaignRepository,
  ) {}

  async execute(workspaceId: string, id: string): Promise<Campaign> {
    const campaign = await this.campaignRepository.findById(workspaceId, id);
    if (!campaign) {
      throw new AppNotFoundException('Campaign');
    }
    return campaign;
  }
}
