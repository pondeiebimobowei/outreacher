import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @IsString()
  @IsOptional()
  sendingIdentity?: string;

  @IsOptional()
  followUpDelayBusinessDays?: number;
}
