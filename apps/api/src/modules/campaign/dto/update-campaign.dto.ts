import type { CampaignStatus, UpdateCampaignRequest } from '@repo/shared';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateCampaignDto implements UpdateCampaignRequest {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  status?: CampaignStatus;

  @IsOptional()
  @IsIn(['TEMPLATE', 'AI'])
  contentSource?: 'TEMPLATE' | 'AI';

  @IsOptional()
  @IsString()
  templateId?: string | null;

  @IsOptional()
  @IsString()
  aiPromptContext?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  followUpDelayBusinessDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxFollowUps?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  senderAccountIds?: string[];
}
