import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateCareerProfileDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  headline?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  summary?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(5000)
  experienceSummary?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @ArrayMaxSize(20)
  targetRoles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @ArrayMaxSize(20)
  targetIndustries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @ArrayMaxSize(20)
  targetLocations?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMaxSize(50)
  skills?: string[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl()
  portfolioUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl()
  githubUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl()
  linkedinUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl()
  websiteUrl?: string | null;
}
