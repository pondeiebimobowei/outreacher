import type { ContentSource, CreateOutreachRequest } from '@repo/shared';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateOutreachDto implements CreateOutreachRequest {
  @IsString()
  @IsNotEmpty()
  personCompanyAssociationId!: string;

  @IsOptional()
  @IsString()
  campaignRecipientId?: string | null;

  @IsOptional()
  @IsString()
  senderAccountId?: string | null;

  @IsOptional()
  @IsIn(['TEMPLATE', 'AI'])
  contentSource?: ContentSource;

  @IsOptional()
  @IsString()
  templateId?: string | null;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  aiPromptContext?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxFollowUps?: number;
}
