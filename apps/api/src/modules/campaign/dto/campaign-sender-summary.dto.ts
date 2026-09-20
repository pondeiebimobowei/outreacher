export interface CampaignSenderSummary {
  assignmentStatus: 'ACTIVE' | 'REMOVED';
  senderAccountId: string;
  fromName: string;
  fromEmail: string;
  senderStatus: 'ACTIVE' | 'PAUSED' | 'DISABLED';
  integrationStatus: 'ACTIVE' | 'INVALID_CREDENTIALS' | 'DISABLED';
}
