import type { CampaignStatus, CreateCampaignRequest } from '@repo/shared';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCampaignDto implements CreateCampaignRequest {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(['TEMPLATE', 'AI'])
  contentSource!: 'TEMPLATE' | 'AI';

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

  @IsArray()
  @IsString({ each: true })
  senderAccountIds!: string[];

  @IsOptional()
  @IsString()
  status?: CampaignStatus;
}
