import { apiClient } from './client';
import {
  CampaignRecipientDto,
  CampaignRecipientSummaryDto,
  CampaignRecipientPerson,
  CampaignRecipientStatus,
  OutreachDto,
  CreateOutreachRequest,
  OutreachStatus,
  AiGenerationStatus,
  ContentSource,
  EmailSendDto,
} from '@repo/shared';

export type {
  CampaignRecipientDto,
  CampaignRecipientSummaryDto,
  CampaignRecipientPerson,
  CampaignRecipientStatus,
  OutreachDto,
  CreateOutreachRequest,
  OutreachStatus,
  AiGenerationStatus,
  ContentSource,
  EmailSendDto,
};

export interface UpdateOutreachInput {
  subject?: string;
  message?: string;
  expectedUpdatedAt?: string;
}

export interface ApproveOutreachInput {
  expectedUpdatedAt?: string;
}

export interface GenerateOutreachResponse {
  jobId?: string;
  message?: string;
}

export interface SendOutreachResponse {
  jobId?: string;
  message?: string;
}

/**
 * Lists all bound CampaignRecipient records for a campaign.
 * Endpoint: GET /api/v1/campaigns/:id/recipients
 */
export async function fetchCampaignRecipients(
  campaignId: string,
): Promise<CampaignRecipientSummaryDto[]> {
  return apiClient.get<CampaignRecipientSummaryDto[]>(
    `/campaigns/${campaignId}/recipients`,
  );
}

/**
 * Retrieves a single Outreach by ID.
 * Endpoint: GET /api/v1/outreaches/:id
 */
export async function fetchOutreachById(id: string): Promise<OutreachDto> {
  return apiClient.get<OutreachDto>(`/outreaches/${id}`);
}

/**
 * Creates a new direct outreach. Requires Idempotency-Key header.
 * Endpoint: POST /api/v1/outreaches
 */
export async function createOutreach(
  input: CreateOutreachRequest,
  idempotencyKey: string,
): Promise<OutreachDto> {
  return apiClient.post<OutreachDto>('/outreaches', input, {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  });
}

/**
 * Updates an outreach draft with optimistic expectedUpdatedAt verification.
 * Only allowed when status === 'DRAFT'.
 * Endpoint: PATCH /api/v1/outreaches/:id
 */
export async function updateOutreach(
  id: string,
  input: UpdateOutreachInput,
): Promise<OutreachDto> {
  return apiClient.patch<OutreachDto>(`/outreaches/${id}`, input);
}

/**
 * Approves an outreach draft.
 * Transitions DRAFT -> APPROVED.
 * Endpoint: POST /api/v1/outreaches/:id/approve
 */
export async function approveOutreach(
  id: string,
  input?: ApproveOutreachInput,
): Promise<OutreachDto> {
  return apiClient.post<OutreachDto>(`/outreaches/${id}/approve`, input ?? {});
}

/**
 * Initiates AI generation for an outreach draft.
 * Endpoint: POST /api/v1/outreaches/:id/generate
 */
export async function generateOutreach(
  id: string,
): Promise<GenerateOutreachResponse> {
  return apiClient.post<GenerateOutreachResponse>(`/outreaches/${id}/generate`);
}

/**
 * Dispatches an outreach draft for delivery. Requires Idempotency-Key header.
 * Transitions DRAFT/APPROVED -> SENDING.
 * Endpoint: POST /api/v1/outreaches/:id/send
 */
export async function sendOutreach(
  id: string,
  idempotencyKey: string,
): Promise<SendOutreachResponse> {
  return apiClient.post<SendOutreachResponse>(
    `/outreaches/${id}/send`,
    {},
    {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    },
  );
}

/**
 * Resumes a paused outreach.
 * Endpoint: POST /api/v1/outreaches/:id/resume
 */
export async function resumeOutreach(id: string): Promise<OutreachDto> {
  return apiClient.post<OutreachDto>(`/outreaches/${id}/resume`);
}
