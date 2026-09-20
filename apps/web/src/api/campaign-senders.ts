import { apiClient } from './client';

export interface CampaignSenderSummary {
  assignmentStatus: 'ACTIVE' | 'REMOVED';
  senderAccountId: string;
  fromName: string;
  fromEmail: string;
  senderStatus: 'ACTIVE' | 'PAUSED' | 'DISABLED';
  integrationStatus: 'ACTIVE' | 'INVALID_CREDENTIALS' | 'DISABLED';
}

/**
 * Assigns one or more sender accounts to a campaign.
 * Replaces any existing ACTIVE assignments with the provided list.
 * Any previously assigned accounts not in this list are marked as REMOVED.
 * 
 * Endpoint: POST /api/v1/campaigns/:id/senders
 */
export async function assignCampaignSenders(
  campaignId: string,
  senderAccountIds: string[],
): Promise<void> {
  await apiClient.post(`/campaigns/${campaignId}/senders`, {
    senderAccountIds,
  });
}
