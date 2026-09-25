export const CONTACT_KINDS = ['PERSON', 'ROLE_ADDRESS'] as const;
export type ContactKind = typeof CONTACT_KINDS[number];

export const CONTACT_RELEVANCES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type ContactRelevance = typeof CONTACT_RELEVANCES[number];

export const EMAIL_CONFIDENCE_STATUSES = ['AVAILABLE', 'UNAVAILABLE'] as const;
export type EmailConfidenceStatus = typeof EMAIL_CONFIDENCE_STATUSES[number];

export interface EvaluatedContactDto {
  id: string;
  workspaceId: string;
  companyId: string;
  contactKind: ContactKind;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  source: string | null;
  sourceUrl: string | null;
  confidence: string | null;
  emailConfidence: EmailConfidenceStatus;
  discoveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  relevance: ContactRelevance;
  recommendationRationale: string;
  isSelected: boolean;
}

export interface CompanyContactsResponse {
  companyId: string;
  status: 'NOT_STARTED' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  selectedContactId: string | null;
  contacts: EvaluatedContactDto[];
  discoveryJob: {
    id: string;
    status: string;
    createdAt: string;
    completedAt?: string | null;
  } | null;
  mock?: boolean;
}

export interface DiscoverContactsResponse {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED';
  reused: boolean;
  contactsCount?: number;
}

export interface CreateContactRequest {
  firstName: string;
  lastName: string;
  email?: string | null;
  title?: string | null;
  personKind?: ContactKind;
  sourceUrl?: string | null;
}
