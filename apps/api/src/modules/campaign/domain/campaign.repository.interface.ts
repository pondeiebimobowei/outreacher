import { Campaign, CampaignContact, CampaignStatus } from '@repo/db';

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
  name: string;
  normalizedName: string;
  sendingIdentity?: string | null;
  followUpDelayBusinessDays?: number;
}

export interface ICampaignRepository {
  create(data: CreateCampaignData): Promise<Campaign>;
  findById(workspaceId: string, id: string): Promise<Campaign | null>;
  findByNormalizedName(
    workspaceId: string,
    companyId: string,
    normalizedName: string,
  ): Promise<Campaign | null>;
  findManyByWorkspace(workspaceId: string): Promise<Campaign[]>;
  updateStatus(
    workspaceId: string,
    id: string,
    status: CampaignStatus,
  ): Promise<Campaign | null>;
  findExistingContactBindings(
    workspaceId: string,
    campaignId: string,
    contactIds: string[],
  ): Promise<Set<string>>;
  createContactBindings(
    workspaceId: string,
    campaignId: string,
    contactIds: string[],
  ): Promise<CampaignContact[]>;
}

export const CAMPAIGN_REPOSITORY_TOKEN = 'ICampaignRepository';
