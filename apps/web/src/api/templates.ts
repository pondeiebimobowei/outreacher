import { apiClient } from './client';
import type {
  EmailTemplateSummaryDto,
  EmailTemplateDto,
  EmailTemplateStepDto,
  ListTemplatesQueryDto,
  CreateEmailTemplateRequest,
  UpdateEmailTemplateRequest,
  SetEmailTemplateStepsRequest,
  PreviewTemplateRequest,
  PreviewTemplateResponse,
  AllowedPlaceholder,
} from '@repo/shared';
import { ALLOWED_PLACEHOLDERS } from '@repo/shared';

export type {
  EmailTemplateSummaryDto,
  EmailTemplateDto,
  EmailTemplateStepDto,
  ListTemplatesQueryDto,
  CreateEmailTemplateRequest,
  UpdateEmailTemplateRequest,
  SetEmailTemplateStepsRequest,
  PreviewTemplateRequest,
  PreviewTemplateResponse,
  AllowedPlaceholder,
};

export { ALLOWED_PLACEHOLDERS };

/**
 * Lists templates for the current authenticated workspace.
 * Endpoint: GET /api/v1/templates(?includeArchived=true)
 */
export async function fetchTemplates(
  query?: ListTemplatesQueryDto,
): Promise<EmailTemplateSummaryDto[]> {
  const params = new URLSearchParams();
  if (query?.includeArchived) {
    params.set('includeArchived', 'true');
  }
  const queryString = params.toString() ? `?${params.toString()}` : '';
  return apiClient.get<EmailTemplateSummaryDto[]>(`/templates${queryString}`);
}

/**
 * Retrieves a full email template by ID including ordered steps.
 * Endpoint: GET /api/v1/templates/:id
 */
export async function fetchTemplateById(id: string): Promise<EmailTemplateDto> {
  return apiClient.get<EmailTemplateDto>(`/templates/${id}`);
}

/**
 * Creates a new email template with initial steps.
 * Endpoint: POST /api/v1/templates
 */
export async function createTemplate(
  input: CreateEmailTemplateRequest,
): Promise<EmailTemplateDto> {
  return apiClient.post<EmailTemplateDto>('/templates', input);
}

/**
 * Updates template metadata (name, isArchived).
 * Endpoint: PATCH /api/v1/templates/:id
 */
export async function updateTemplate(
  id: string,
  input: UpdateEmailTemplateRequest,
): Promise<EmailTemplateDto> {
  return apiClient.patch<EmailTemplateDto>(`/templates/${id}`, input);
}

/**
 * Updates/replaces ordered steps for a template.
 * Endpoint: PUT /api/v1/templates/:id/steps
 */
export async function setTemplateSteps(
  id: string,
  input: SetEmailTemplateStepsRequest,
): Promise<EmailTemplateDto> {
  return apiClient.put<EmailTemplateDto>(`/templates/${id}/steps`, input);
}

/**
 * Deletes an email template.
 * Endpoint: DELETE /api/v1/templates/:id
 */
export async function deleteTemplate(id: string): Promise<void> {
  return apiClient.delete<void>(`/templates/${id}`);
}

/**
 * Previews rendered steps for a template given contact/opportunity context.
 * Endpoint: POST /api/v1/templates/:id/preview
 */
export async function previewTemplate(
  id: string,
  input: PreviewTemplateRequest,
): Promise<PreviewTemplateResponse> {
  return apiClient.post<PreviewTemplateResponse>(`/templates/${id}/preview`, input);
}
