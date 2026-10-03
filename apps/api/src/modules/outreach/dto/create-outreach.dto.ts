import { ContentSource, CreateOutreachRequest } from '@repo/shared';

export class CreateOutreachDto implements CreateOutreachRequest {
  personCompanyAssociationId!: string;
  campaignRecipientId?: string | null;
  senderAccountId?: string | null;
  contentSource?: ContentSource;
  templateId?: string | null;
  subject?: string;
  message?: string;
  aiPromptContext?: string | null;
  maxFollowUps?: number;
}
