import { IsOptional, IsString } from 'class-validator';

export class PreviewTemplateDto {
  @IsString()
  personCompanyAssociationId!: string;

  @IsOptional()
  @IsString()
  senderAccountId?: string;

  @IsOptional()
  @IsString()
  opportunityId?: string;
}
