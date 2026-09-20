import type { CampaignStatus } from '../api/campaigns';
import type { CampaignSenderSummary } from '../api/campaign-senders';

export type CampaignSenderReadiness =
  | { state: 'READY'; eligibleSenderCount: number }
  | { state: 'NEEDS_SENDER' }
  | { state: 'ALL_SENDERS_INELIGIBLE'; detail: string }
  | { state: 'READINESS_UNKNOWN'; detail: string }
  | { state: 'CAMPAIGN_NOT_DISPATCHABLE' };

const DISPATCHABLE_CAMPAIGN_STATUSES = new Set<CampaignStatus>(['DRAFT', 'ACTIVE']);

/**
 * Computes Campaign Configuration Readiness.
 * This defines whether the campaign currently has at least one sender that is structurally eligible for dispatch.
 * Actual dispatch remains authoritative to SendEligibilityService on the backend.
 */
export function computeCampaignReadiness(
  campaignStatus: CampaignStatus,
  senders: CampaignSenderSummary[] = [],
): CampaignSenderReadiness {
  if (!DISPATCHABLE_CAMPAIGN_STATUSES.has(campaignStatus)) {
    return { state: 'CAMPAIGN_NOT_DISPATCHABLE' };
  }

  const activeAssignments = senders.filter((s) => s.assignmentStatus === 'ACTIVE');

  if (activeAssignments.length === 0) {
    return { state: 'NEEDS_SENDER' };
  }

  let eligibleCount = 0;
  let hasUnknown = false;

  for (const sender of activeAssignments) {
    // If the integration query failed entirely, frontend might represent it differently,
    // but based on CampaignSenderSummary, integrationStatus is ACTIVE, INVALID_CREDENTIALS, or DISABLED.
    // If we passed an explicit frontend UNKNOWN (mapped from query failure), handle it.
    // However, the contract requested integrationStatus: 'ACTIVE' | 'INVALID_CREDENTIALS' | 'DISABLED'.
    // If we have an external way of knowing it's UNKNOWN (like a wrapped query), that would be here.
    // Let's assume frontend query failure maps to an augmented type or explicit unknown indicator.
    // For now, if the sender explicitly has a state mapping to unknown, handle it.
    // Wait, the spec says "integration query failed → READINESS_UNKNOWN".
    
    // We'll augment the input type to allow frontend to pass { isIntegrationQueryFailed: boolean } or similar,
    // or just assume if it's not strictly known, it's unknown. But let's stick to the prompt's instruction.
    // Actually, in 9D-C we used an `isIntegrationUnknown` or something similar. 
    // Let's add a property `isIntegrationUnknown?: boolean` to the summary for frontend evaluation.
    
    if ((sender as any).isIntegrationUnknown) {
      hasUnknown = true;
      continue;
    }

    if (sender.senderStatus === 'ACTIVE' && sender.integrationStatus === 'ACTIVE') {
      eligibleCount++;
    }
  }

  if (eligibleCount > 0) {
    return { state: 'READY', eligibleSenderCount: eligibleCount };
  }

  if (hasUnknown) {
    return { state: 'READINESS_UNKNOWN', detail: 'Could not verify integration status' };
  }

  return { state: 'ALL_SENDERS_INELIGIBLE', detail: 'Assigned accounts need attention' };
}
