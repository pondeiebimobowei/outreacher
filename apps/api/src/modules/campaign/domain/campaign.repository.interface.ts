import { Campaign, CampaignMember, CampaignStatus } from '@repo/db';
import { CampaignSenderSummary } from '../dto/campaign-sender-summary.dto';

export type CampaignWithSenders = Campaign & {
  senders?: CampaignSenderSummary[];
};

export class CampaignDuplicateNameError extends Error {
  constructor(
    public readonly workspaceId: string,
    public readonly companyId: string,
    public readonly normalizedName: string,
  ) {
    super(
      `Campaign with normalized name "${normalizedName}" already exists for company "${companyId}" in workspace "${workspaceId}".`,
    );
    this.name = 'CampaignDuplicateNameError';
  }
}

export interface CreateCampaignData {
  workspaceId: string;
  companyId: string;
  senderAccountId: string;
  templateId: string,
  name: string;
  normalizedName: string;
  status: CampaignStatus,
  followUpDelayBusinessDays?: number;
}

export interface ICampaignRepository {
  create(data: CreateCampaignData): Promise<CampaignWithSenders>;
  findById(workspaceId: string, id: string): Promise<CampaignWithSenders | null>;
  findByNormalizedName(
    workspaceId: string,
    companyId: string,
    normalizedName: string,
  ): Promise<CampaignWithSenders | null>;
  findManyByWorkspace(workspaceId: string): Promise<CampaignWithSenders[]>;
  updateStatus(
    workspaceId: string,
    id: string,
    status: CampaignStatus,
  ): Promise<CampaignWithSenders | null>;
  findExistingContactBindings(
    workspaceId: string,
    campaignId: string,
    contactIds: string[],
  ): Promise<Set<string>>;
  createContactBindings(
    workspaceId: string,
    campaignId: string,
    contactIds: string[],
  ): Promise<CampaignMember[]>;
}

export const CAMPAIGN_REPOSITORY_TOKEN = 'ICampaignRepository';
