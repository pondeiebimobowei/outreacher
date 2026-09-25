import { apiClient } from './client';
import { normalizeCampaignName } from '@repo/shared';
import type {
  CampaignDto,
  CreateCampaignRequest,
  AddCampaignContactsResponse,
  CampaignStatus,
  CampaignContactStatus,
  CampaignSenderSummary,
  CampaignContactDto
} from '@repo/shared';

export type {
  CampaignDto,
  CreateCampaignRequest,
  AddCampaignContactsResponse,
  CampaignStatus,
  CampaignContactStatus,
  CampaignSenderSummary,
  CampaignContactDto
};

/**
 * Lists all campaigns for the current authenticated workspace.
 * Endpoint: GET /api/v1/campaigns
 */
export async function fetchCampaigns(): Promise<CampaignDto[]> {
  return apiClient.get<CampaignDto[]>('/campaigns');
}

/**
 * Creates a new campaign within the current authenticated workspace.
 * Endpoint: POST /api/v1/campaigns
 */
export async function createCampaign(input: CreateCampaignRequest): Promise<CampaignDto> {
  return apiClient.post<CampaignDto>('/campaigns', input);
}

/**
 * Retrieves a single campaign by ID.
 * Endpoint: GET /api/v1/campaigns/:id
 */
export async function fetchCampaignById(id: string): Promise<CampaignDto> {
  return apiClient.get<CampaignDto>(`/campaigns/${id}`);
}

/**
 * Binds target contacts to a campaign.
 * Endpoint: POST /api/v1/campaigns/:id/contacts
 */
export async function addContactsToCampaign(
  campaignId: string,
  contactIds: string[],
): Promise<AddCampaignContactsResponse> {
  return apiClient.post<AddCampaignContactsResponse>(`/campaigns/${campaignId}/contacts`, {
    contactIds,
  });
}

const inFlightCanonicalResolutions = new Map<string, Promise<CampaignDto | null>>();

/**
 * Resolves the canonical company campaign using existing frontend/API retrieval contracts.
 * Matches strictly by companyId and canonical normalized name ('Outreach — [Company Name]'),
 * using the authoritative normalizer from @repo/shared, regardless of campaign status (e.g. DRAFT, ACTIVE, PAUSED).
 * Deduplicates in-flight client resolutions for the same companyId to prevent local race conditions.
 * DOES NOT attempt to auto-create the campaign because creation requires a sender account and template.
 */
export async function resolveCanonicalCompanyCampaign(
  companyId: string,
  companyName?: string,
): Promise<CampaignDto | null> {
  const existingInFlight = inFlightCanonicalResolutions.get(companyId);
  if (existingInFlight) {
    return existingInFlight;
  }

  const resolutionPromise = (async () => {
    try {
      const canonicalName = `Outreach — ${companyName ? companyName.trim() : 'Company'}`;
      const normalizedTarget = normalizeCampaignName(canonicalName);
      const existingCampaigns = await fetchCampaigns();
      const canonical = existingCampaigns.find(
        (c) =>
          c.companyId === companyId &&
          normalizeCampaignName(c.name) === normalizedTarget,
      );

      return canonical || null;
    } finally {
      inFlightCanonicalResolutions.delete(companyId);
    }
  })();

  inFlightCanonicalResolutions.set(companyId, resolutionPromise);
  return resolutionPromise;
}

/**
 * Pauses an active campaign, blocking new sends.
 * In-flight dispatches already handed to the provider will complete.
 * Endpoint: POST /api/v1/campaigns/:id/pause
 */
export async function pauseCampaign(id: string): Promise<CampaignDto> {
  return apiClient.post<CampaignDto>(`/campaigns/${id}/pause`);
}

/**
 * Resumes a paused campaign, re-enabling manual and automated sends.
 * Endpoint: POST /api/v1/campaigns/:id/resume
 */
export async function resumeCampaign(id: string): Promise<CampaignDto> {
  return apiClient.post<CampaignDto>(`/campaigns/${id}/resume`);
}
