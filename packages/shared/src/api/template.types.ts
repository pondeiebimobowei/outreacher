export const CONTENT_SOURCES = ['MANUAL', 'TEMPLATE', 'AI'] as const;
export type ContentSource = (typeof CONTENT_SOURCES)[number];

export const ALLOWED_PLACEHOLDERS = [
  'contact.firstName',
  'contact.lastName',
  'contact.title',
  'company.name',
  'company.website',
  'opportunity.title',
  'recipient.role',
  'sender.name',
] as const;
export type AllowedPlaceholder = (typeof ALLOWED_PLACEHOLDERS)[number];

export interface EmailTemplateStepDto {
  id: string;
  templateId: string;
  sequence: number;
  subjectTemplate: string;
  bodyTemplate: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateSummaryDto {
  id: string;
  workspaceId: string;
  name: string;
  isArchived: boolean;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateDto {
  id: string;
  workspaceId: string;
  name: string;
  isArchived: boolean;
  steps: EmailTemplateStepDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ListTemplatesQueryDto {
  includeArchived?: boolean;
}

export interface CreateEmailTemplateRequest {
  name: string;
  steps: Array<{
    sequence: number;
    subjectTemplate: string;
    bodyTemplate: string;
  }>;
}

export interface UpdateEmailTemplateRequest {
  name?: string;
  isArchived?: boolean;
}

export interface SetEmailTemplateStepsRequest {
  steps: Array<{
    sequence: number;
    subjectTemplate: string;
    bodyTemplate: string;
  }>;
}

export interface PreviewTemplateRequest {
  personCompanyAssociationId: string;
  senderAccountId?: string;
  opportunityId?: string;
}

export interface PreviewTemplateResponse {
  renderedSteps: Array<{
    sequence: number;
    subject: string;
    body: string;
  }>;
}
