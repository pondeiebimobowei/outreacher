import { apiClient } from './client';
import type { CampaignSenderSummary } from '@repo/shared';

export type { CampaignSenderSummary };

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
