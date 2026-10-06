import { ContentSource } from './template.types';

export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'ARCHIVED',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_RECIPIENT_STATUSES = [
  'PENDING',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'SUPPRESSED',
  'FAILED',
  'REMOVED',
] as const;
export type CampaignRecipientStatus = (typeof CAMPAIGN_RECIPIENT_STATUSES)[number];

export const OUTREACH_STATUSES = [
  'DRAFT',
  'APPROVED',
  'SENDING',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const AI_GENERATION_STATUSES = [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'SKIPPED',
] as const;
export type AiGenerationStatus = (typeof AI_GENERATION_STATUSES)[number];

export const CONVERSATION_STATES = [
  'NO_REPLY',
  'ACTIVE',
  'REPLIED',
  'STOPPED',
] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

export const JOB_CANCELLATION_REASONS = [
  'PAUSED',
  'SUPPRESSED',
  'CANCELLED_BY_USER',
] as const;
export type JobCancellationReason = (typeof JOB_CANCELLATION_REASONS)[number];

export const SUPPRESSION_REASONS = [
  'USER_REQUEST',
  'UNSUBSCRIBED',
  'BOUNCED',
  'COMPLAINT',
  'MANUAL',
  'SYSTEM',
] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const SUPPRESSION_ACTIONS = [
  'SUPPRESSED',
  'UNSUPPRESSED',
] as const;
export type SuppressionAction = (typeof SUPPRESSION_ACTIONS)[number];

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
  name: string;
  status: CampaignStatus;
  contentSource: 'TEMPLATE' | 'AI';
  templateId: string | null;
  aiPromptContext: string | null;
  followUpDelayBusinessDays: number;
  maxFollowUps: number;
  recipientCount?: number;
  companyCount?: number;
  senderAccountIds: string[];
  createdAt: string;
  updatedAt: string;
  senders?: CampaignSenderSummary[];
}

export interface CreateCampaignRequest {
  name: string;
  contentSource: 'TEMPLATE' | 'AI';
  templateId?: string | null;
  aiPromptContext?: string | null;
  followUpDelayBusinessDays?: number;
  maxFollowUps?: number;
  senderAccountIds: string[];
}

export interface UpdateCampaignRequest {
  name?: string;
  status?: CampaignStatus;
  contentSource?: 'TEMPLATE' | 'AI';
  templateId?: string | null;
  aiPromptContext?: string | null;
  followUpDelayBusinessDays?: number;
  maxFollowUps?: number;
  senderAccountIds?: string[];
}

export interface CampaignRecipientDto {
  id: string;
  workspaceId: string;
  campaignId: string;
  personCompanyAssociationId: string;
  status: CampaignRecipientStatus;
  targetRole: string | null;
  selectedOpportunityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutreachPerson {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  email: string | null;
  personKind: 'PERSON' | 'ROLE_ADDRESS';
  confidence: string | null;
}

export interface OutreachCompany {
  id: string;
  name: string;
}

export interface OutreachDto {
  id: string;
  workspaceId: string;
  personCompanyAssociationId: string;
  campaignRecipientId: string | null;
  senderAccountId: string | null;
  contentSource: ContentSource;
  templateId: string | null;
  aiPromptContext: string | null;
  aiGenerationStatus: AiGenerationStatus | null;
  draftVersion: number;
  subject: string;
  message: string;
  outreachReason: string | null;
  status: OutreachStatus;
  maxFollowUps: number;
  createdAt: string;
  updatedAt: string;
  person?: OutreachPerson;
  company?: OutreachCompany;
}

export interface CreateOutreachRequest {
  personCompanyAssociationId: string;
  campaignRecipientId?: string | null;
  senderAccountId?: string | null;
  contentSource?: ContentSource;
  templateId?: string | null;
  subject?: string;
  message?: string;
  aiPromptContext?: string | null;
  maxFollowUps?: number;
}

export interface EmailSendDto {
  id: string;
  workspaceId: string;
  outreachId: string;
  senderAccountId: string;
  sequence: number;
  type: 'INITIAL' | 'FOLLOW_UP';
  subject: string;
  body: string;
  status: 'PENDING' | 'RESERVED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  expectedStateVersion: number | null;
  scheduledAt: string | null;
  reservedAt: string | null;
  sentAt: string | null;
  failedAt: string | null;
  firstProviderAttemptAt: string | null;
  providerMessageId: string | null;
  messageId: string | null;
  provider: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  replyToToken: string;
  retryable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignRecipientPerson {
  id: string;
  firstName: string;
  lastName: string;
  title: string | null;
  email: string | null;
  personKind: 'PERSON' | 'ROLE_ADDRESS';
  confidence: string | null;
}

export interface CampaignRecipientSummaryDto extends CampaignRecipientDto {
  person: CampaignRecipientPerson;
  outreachId?: string | null;
  outreach?: {
    id: string;
    status: OutreachStatus;
    subject: string;
    message: string;
    aiGenerationStatus: AiGenerationStatus | null;
  } | null;
}
