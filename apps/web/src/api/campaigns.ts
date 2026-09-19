import { normalizeCampaignName } from '@repo/shared';
import { apiClient, ApiError } from './client';

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';

export type CampaignContactStatus =
  | 'PENDING'
  | 'READY'
  | 'SCHEDULED'
  | 'SENDING'
  | 'SENT'
  | 'FOLLOW_UP_DUE'
  | 'REPLIED'
  | 'COMPLETED'
  | 'SUPPRESSED'
  | 'FAILED'
  | 'ARCHIVED';

export interface CampaignDto {
  id: string;
  workspaceId: string;
  companyId: string;
  name: string;
  normalizedName?: string;
  status: CampaignStatus;
  sendingIdentity: string | null;
  followUpDelayBusinessDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignInput {
  name: string;
  companyId: string;
  sendingIdentity?: string;
  followUpDelayBusinessDays?: number;
}

export interface CampaignContactDto {
  id: string;
  workspaceId: string;
  campaignId: string;
  contactId: string;
  status: CampaignContactStatus;
  targetRole: string | null;
  outreachReason: string | null;
  currentSubject: string | null;
  currentBody: string | null;
  selectedOpportunityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddCampaignContactsResponse {
  bound: CampaignContactDto[];
  ignoredDuplicateCount: number;
}

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
export async function createCampaign(input: CreateCampaignInput): Promise<CampaignDto> {
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

const inFlightCanonicalResolutions = new Map<string, Promise<CampaignDto>>();

/**
 * Resolves the canonical company campaign using existing frontend/API retrieval contracts.
 * Matches strictly by companyId and canonical normalized name ('Outreach — [Company Name]'),
 * using the authoritative normalizer from @repo/shared, regardless of campaign status (e.g. DRAFT, ACTIVE, PAUSED).
 * Deduplicates in-flight client resolutions for the same companyId to prevent local race conditions,
 * and recovers gracefully via re-fetch if a concurrent context creates the campaign (409 Conflict with CAMPAIGN_ALREADY_EXISTS).
 */
export async function resolveCanonicalCompanyCampaign(
  companyId: string,
  companyName?: string,
): Promise<CampaignDto> {
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

      if (canonical) {
        return canonical;
      }

      try {
        return await createCampaign({
          companyId,
          name: canonicalName,
        });
      } catch (createErr) {
        // If another context or tab created the canonical campaign concurrently, recover via re-fetch
        if (
          createErr instanceof ApiError &&
          createErr.statusCode === 409 &&
          createErr.code === 'CAMPAIGN_ALREADY_EXISTS'
        ) {
          const refreshed = await fetchCampaigns();
          // If the backend returned existingCampaignId, select by ID first
          if (createErr.existingCampaignId) {
            const directMatch = refreshed.find(
              (c) => c.id === createErr.existingCampaignId && c.companyId === companyId,
            );
            if (directMatch) {
              return directMatch;
            }
          }
          // Fall back to normalized name match across refreshed list
          const canonicalOnConflict = refreshed.find(
            (c) =>
              c.companyId === companyId &&
              normalizeCampaignName(c.name) === normalizedTarget,
          );
          if (canonicalOnConflict) {
            return canonicalOnConflict;
          }
        }
        throw createErr;
      }
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

