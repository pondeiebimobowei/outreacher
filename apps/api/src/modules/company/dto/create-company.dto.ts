import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @MinLength(1, { message: 'Company name cannot be empty.' })
  @MaxLength(100, { message: 'Company name is too long.' })
  name!: string;

  @IsOptional()
  @IsString()
  websiteUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string | null;

  @IsOptional()
  @IsString()
  linkedinUrl?: string | null;
}
