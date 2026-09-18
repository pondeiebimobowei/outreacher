import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
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
  @IsInt()
  @Min(1)
  @Max(30)
  followUpDelayBusinessDays?: number;
}
