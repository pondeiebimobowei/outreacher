import { CampaignStatus, UpdateCampaignRequest } from '@repo/shared';

export class UpdateCampaignDto implements UpdateCampaignRequest {
  name?: string;
  status?: CampaignStatus;
  contentSource?: 'TEMPLATE' | 'AI';
  templateId?: string | null;
  aiPromptContext?: string | null;
  followUpDelayBusinessDays?: number;
  maxFollowUps?: number;
  senderAccountIds?: string[];
}
