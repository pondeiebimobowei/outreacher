import { Person } from '../../../db';

export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'ARCHIVED',
] as const;

export type CampaignStatus = typeof CAMPAIGN_STATUSES[number];

export const CAMPAIGN_CONTACT_STATUSES = [
  'PENDING',
  'READY',
  'SCHEDULED',
  'SENDING',
  'SENT',
  'FOLLOW_UP_DUE',
  'REPLIED',
  'COMPLETED',
  'SUPPRESSED',
  'FAILED',
  'ARCHIVED',
] as const;

export type CampaignContactStatus = typeof CAMPAIGN_CONTACT_STATUSES[number];

export interface CampaignSenderSummary {
  assignmentStatus: 'ACTIVE' | 'REMOVED';
  senderAccountId: string;
  fromName: string;
  fromEmail: string;
  senderStatus: 'ACTIVE' | 'PAUSED' | 'DISABLED';
  integrationStatus: 'ACTIVE' | 'INVALID_CREDENTIALS' | 'DISABLED';
  isIntegrationUnknown?: boolean;
}

export interface CampaignDto {
  id: string;
  workspaceId: string;
  companyId: string;
  senderAccountId: string;
  templateId: string;
  name: string;
  normalizedName: string;
  status: CampaignStatus;
  followUpDelayBusinessDays: number;
  createdAt: string;
  updatedAt: string;
  senders?: CampaignSenderSummary[];
}

export interface CreateCampaignRequest {
  name: string;
  companyId: string;
  senderAccountId: string;
  templateId: string;
  status: CampaignStatus;
  followUpDelayBusinessDays?: number;
}

export interface CampaignContactDto {
  id: string;
  workspaceId: string;
  campaignId: string;
  personId: string;
  status: CampaignContactStatus;
  targetRole: string | null;
  outreachReason: string | null;
  currentSubject: string | null;
  currentBody: string | null;
  selectedOpportunityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignContactWithPerson extends CampaignContactDto {
  person: Exclude<
    Person,
    'workspaceId' | 'createdAt' | 'updatedAt'
  >;
}

export interface AddCampaignContactsResponse {
  bound: CampaignContactDto[];
  ignoredDuplicateCount: number;
}
