import { apiClient } from './client';
import { CampaignContactDto, CampaignContactStatus } from './campaigns';

export interface CampaignContactEvidenceDto {
  id: string;
  claim: string;
  classification: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourceExcerpt?: string | null;
  confidence?: number | null;
}

export interface GenerationJobDto {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER';
  createdAt: string;
  completedAt?: string | null;
  lastError?: string | null;
}

export interface EmailSendSummaryDto {
  id: string;
  status: 'PENDING' | 'RESERVED' | 'SENDING' | 'SENT' | 'FAILED';
  sentAt?: string | null;
  failedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface CampaignContactDetailsDto {
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
  contact: {
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    contactKind: 'PERSON' | 'ROLE_ADDRESS';
    confidence: string | null;
    emailConfidence: 'AVAILABLE' | 'UNAVAILABLE';
  };
  campaign: {
    id: string;
    name: string;
    status: string;
    companyId: string;
  };
  selectedOpportunity: {
    id: string;
    roleTitle: string;
    opportunityType: string;
  } | null;
  evidence: CampaignContactEvidenceDto[];
  generationJob: GenerationJobDto | null;
  latestEmailSend: EmailSendSummaryDto | null;
}

export interface CampaignContactSummaryDto {
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
  contact: {
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    contactKind: 'PERSON' | 'ROLE_ADDRESS';
    confidence: string | null;
  };
}

export interface UpdateDraftInput {
  subject?: string;
  bodyText?: string;
  expectedUpdatedAt?: string;
}

export interface ApproveDraftInput {
  expectedUpdatedAt?: string;
}

export interface GenerateOutreachResponse {
  jobId: string;
  status: string;
}

/**
 * Retrieves a single CampaignContact with associated contact details,
 * campaign, opportunity, evidence dossier, and generation job status.
 * Endpoint: GET /api/v1/campaign-contacts/:id
 */
export async function fetchCampaignContact(
  id: string,
): Promise<CampaignContactDetailsDto> {
  return apiClient.get<CampaignContactDetailsDto>(`/campaign-contacts/${id}`);
}

/**
 * Lists all bound CampaignContact records for a campaign.
 * Endpoint: GET /api/v1/campaigns/:id/contacts
 */
export async function fetchCampaignContacts(
  campaignId: string,
): Promise<CampaignContactSummaryDto[]> {
  return apiClient.get<CampaignContactSummaryDto[]>(
    `/campaigns/${campaignId}/contacts`,
  );
}

/**
 * Initiates asynchronous AI outreach draft generation.
 * Endpoint: POST /api/v1/campaign-contacts/:id/generate-outreach
 */
export async function triggerGenerateOutreach(
  id: string,
): Promise<GenerateOutreachResponse> {
  return apiClient.post<GenerateOutreachResponse>(
    `/campaign-contacts/${id}/generate-outreach`,
  );
}

/**
 * Updates an outreach draft with optimistic concurrency verification.
 * Endpoint: PATCH /api/v1/campaign-contacts/:id/draft
 */
export async function updateOutreachDraft(
  id: string,
  input: UpdateDraftInput,
): Promise<CampaignContactDto> {
  return apiClient.patch<CampaignContactDto>(
    `/campaign-contacts/${id}/draft`,
    input,
  );
}

/**
 * Explicitly approves an outreach draft for dispatch (BL-012).
 * Transitions status PENDING -> READY.
 * Endpoint: POST /api/v1/campaign-contacts/:id/approve
 */
export async function approveOutreachDraft(
  id: string,
  input?: ApproveDraftInput,
): Promise<CampaignContactDto> {
  return apiClient.post<CampaignContactDto>(
    `/campaign-contacts/${id}/approve`,
    input ?? {},
  );
}

export interface SendCampaignContactResponse {
  jobId: string;
  message: string;
}

/**
 * Dispatches an approved CampaignContact for immediate delivery (BL-014).
 * Requires client-generated UUID Idempotency-Key.
 * Transitions status READY -> SENDING.
 * Endpoint: POST /api/v1/campaign-contacts/:id/send
 */
export async function sendCampaignContact(
  campaignContactId: string,
  idempotencyKey: string,
): Promise<SendCampaignContactResponse> {
  return apiClient.post<SendCampaignContactResponse>(
    `/campaign-contacts/${campaignContactId}/send`,
    {},
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    },
  );
}
