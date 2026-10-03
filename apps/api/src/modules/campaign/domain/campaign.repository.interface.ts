import { Campaign, CampaignRecipient, CampaignStatus } from '@repo/db';
import { CampaignSenderSummary } from '../dto/campaign-sender-summary.dto';

export type CampaignWithSenders = Campaign & {
  senders?: CampaignSenderSummary[];
};

export class CampaignDuplicateNameError extends Error {
  constructor(
    public readonly workspaceId: string,
    public readonly normalizedName: string,
  ) {
    super(
      `Campaign with normalized name "${normalizedName}" already exists in workspace "${workspaceId}".`,
    );
    this.name = 'CampaignDuplicateNameError';
  }
}

export interface CreateCampaignData {
  workspaceId: string;
  name: string;
  status: CampaignStatus;
  contentSource?: 'TEMPLATE' | 'AI';
  templateId?: string | null;
  aiPromptContext?: string | null;
  followUpDelayBusinessDays?: number;
  maxFollowUps?: number;
}

export interface ICampaignRepository {
  create(data: CreateCampaignData): Promise<CampaignWithSenders>;
  findById(
    workspaceId: string,
    id: string,
  ): Promise<CampaignWithSenders | null>;
  findByName(
    workspaceId: string,
    name: string,
  ): Promise<CampaignWithSenders | null>;
  findManyByWorkspace(workspaceId: string): Promise<CampaignWithSenders[]>;
  updateStatus(
    workspaceId: string,
    id: string,
    status: CampaignStatus,
  ): Promise<CampaignWithSenders | null>;
  createRecipientBindings(
    workspaceId: string,
    campaignId: string,
    pcaIds: string[],
  ): Promise<CampaignRecipient[]>;
}

export const CAMPAIGN_REPOSITORY_TOKEN = 'ICampaignRepository';
