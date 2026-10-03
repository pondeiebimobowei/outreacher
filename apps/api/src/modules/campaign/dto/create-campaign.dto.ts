import { CampaignStatus, CreateCampaignRequest } from '@repo/shared';

export class CreateCampaignDto implements CreateCampaignRequest {
  name!: string;
  contentSource!: 'TEMPLATE' | 'AI';
  templateId?: string | null;
  aiPromptContext?: string | null;
  followUpDelayBusinessDays?: number;
  maxFollowUps?: number;
  senderAccountIds!: string[];
  status?: CampaignStatus;
}
