export interface CampaignRecipientInput {
  personCompanyAssociationId: string;
  targetRole?: string | null;
  selectedOpportunityId?: string | null;
}

export class AddCampaignRecipientsDto {
  recipients!: CampaignRecipientInput[];
}
