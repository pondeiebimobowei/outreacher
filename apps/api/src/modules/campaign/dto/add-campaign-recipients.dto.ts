import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CampaignRecipientInput {
  @IsString()
  @IsNotEmpty()
  personCompanyAssociationId!: string;

  @IsOptional()
  @IsString()
  targetRole?: string | null;

  @IsOptional()
  @IsString()
  selectedOpportunityId?: string | null;
}

export class AddCampaignRecipientsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampaignRecipientInput)
  recipients!: CampaignRecipientInput[];
}
