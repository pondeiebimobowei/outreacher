import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsEnum,
} from 'class-validator';
import { CAMPAIGN_STATUSES } from '@repo/shared';
import type { CreateCampaignRequest, CampaignStatus } from '@repo/shared';

export class CreateCampaignDto implements CreateCampaignRequest {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @IsString()
  @IsNotEmpty()
  senderAccountId!: string;

  @IsString()
  @IsNotEmpty()
  templateId!: string;

  @IsEnum(CAMPAIGN_STATUSES)
  @IsNotEmpty()
  status!: CampaignStatus;

  @IsString()
  @IsOptional()
  sendingIdentity?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  followUpDelayBusinessDays?: number;
}
