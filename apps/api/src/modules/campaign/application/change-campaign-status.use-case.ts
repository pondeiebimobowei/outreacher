import { Inject, Injectable } from '@nestjs/common';
import { Campaign } from '@repo/db';
import { CampaignWithSenders } from '../domain/campaign.repository.interface';
import {
  AppConflictException,
  AppNotFoundException,
} from '../../../common/errors/application.exception';
import {
  CAMPAIGN_REPOSITORY_TOKEN,
  type ICampaignRepository,
} from '../domain/campaign.repository.interface';

export type CampaignLifecycleAction = 'PAUSE' | 'RESUME' | 'ARCHIVE';

@Injectable()
export class ChangeCampaignStatusUseCase {
  constructor(
    @Inject(CAMPAIGN_REPOSITORY_TOKEN)
    private readonly campaignRepository: ICampaignRepository,
  ) {}

  async pause(workspaceId: string, campaignId: string): Promise<CampaignWithSenders> {
    const campaign = await this.findCampaignOrThrow(workspaceId, campaignId);

    if (campaign.status !== 'ACTIVE') {
      throw new AppConflictException(
        `Cannot pause campaign with status "${campaign.status}". Only ACTIVE campaigns can be paused.`,
      );
    }

    const updated = await this.campaignRepository.updateStatus(
      workspaceId,
      campaignId,
      'PAUSED',
    );

    if (!updated) {
      throw new AppNotFoundException('Campaign');
    }

    return updated;
  }

  async resume(workspaceId: string, campaignId: string): Promise<CampaignWithSenders> {
    const campaign = await this.findCampaignOrThrow(workspaceId, campaignId);

    if (campaign.status !== 'PAUSED') {
      throw new AppConflictException(
        `Cannot resume campaign with status "${campaign.status}". Only PAUSED campaigns can be resumed.`,
      );
    }

    const updated = await this.campaignRepository.updateStatus(
      workspaceId,
      campaignId,
      'ACTIVE',
    );

    if (!updated) {
      throw new AppNotFoundException('Campaign');
    }

    return updated;
  }

  async archive(workspaceId: string, campaignId: string): Promise<CampaignWithSenders> {
    const campaign = await this.findCampaignOrThrow(workspaceId, campaignId);

    if (campaign.status === 'ARCHIVED') {
      throw new AppConflictException(
        'Cannot archive campaign that is already ARCHIVED. ARCHIVED is a terminal state.',
      );
    }

    const updated = await this.campaignRepository.updateStatus(
      workspaceId,
      campaignId,
      'ARCHIVED',
    );

    if (!updated) {
      throw new AppNotFoundException('Campaign');
    }

    return updated;
  }

  async execute(
    workspaceId: string,
    campaignId: string,
    action: CampaignLifecycleAction,
  ): Promise<CampaignWithSenders> {
    switch (action) {
      case 'PAUSE':
        return this.pause(workspaceId, campaignId);
      case 'RESUME':
        return this.resume(workspaceId, campaignId);
      case 'ARCHIVE':
        return this.archive(workspaceId, campaignId);
      default:
        throw new AppConflictException(
          `Invalid lifecycle action: ${String(action)}`,
        );
    }
  }

  private async findCampaignOrThrow(
    workspaceId: string,
    campaignId: string,
  ): Promise<CampaignWithSenders> {
    const campaign = await this.campaignRepository.findById(
      workspaceId,
      campaignId,
    );

    if (!campaign) {
      throw new AppNotFoundException('Campaign');
    }

    return campaign;
  }
}
