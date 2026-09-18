import { Campaign, CampaignStatus } from '@repo/db';

export interface CreateCampaignData {
  workspaceId: string;
  companyId: string;
  name: string;
  sendingIdentity?: string | null;
  followUpDelayBusinessDays?: number;
}

export interface ICampaignRepository {
  create(data: CreateCampaignData): Promise<Campaign>;
  findById(workspaceId: string, id: string): Promise<Campaign | null>;
  findManyByWorkspace(workspaceId: string): Promise<Campaign[]>;
  updateStatus(
    workspaceId: string,
    id: string,
    status: CampaignStatus,
  ): Promise<Campaign | null>;
}

export const CAMPAIGN_REPOSITORY_TOKEN = 'ICampaignRepository';
