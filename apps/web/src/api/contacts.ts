import { apiClient } from './client';

export type ContactKind = 'PERSON' | 'ROLE_ADDRESS';
export type ContactRelevance = 'HIGH' | 'MEDIUM' | 'LOW';
export type EmailConfidenceStatus = 'AVAILABLE' | 'UNAVAILABLE';

export interface EvaluatedContactDto {
  id: string;
  workspaceId: string;
  companyId: string;
  contactKind: ContactKind;
  name: string;
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

export async function fetchCompanyContacts(companyId: string): Promise<CompanyContactsResponse> {
  return apiClient.get<CompanyContactsResponse>(`/companies/${companyId}/contacts`);
}

export async function discoverCompanyContacts(
  companyId: string,
  options?: { forceRefresh?: boolean },
): Promise<DiscoverContactsResponse> {
  return apiClient.post<DiscoverContactsResponse>(
    `/companies/${companyId}/contacts/discover`,
    options ?? {},
  );
}

export async function fetchContactById(contactId: string): Promise<EvaluatedContactDto> {
  return apiClient.get<EvaluatedContactDto>(`/contacts/${contactId}`);
}

export async function selectCompanyContact(
  companyId: string,
  contactId: string,
): Promise<{ id: string; companyId: string; contactId: string; selectedAt: string }> {
  return apiClient.post<{ id: string; companyId: string; contactId: string; selectedAt: string }>(
    `/companies/${companyId}/contacts/${contactId}/select`,
  );
}

export interface CreateContactInput {
  name: string;
  email?: string | null;
  title?: string | null;
  contactKind?: ContactKind;
  sourceUrl?: string | null;
}

export async function createCompanyContact(
  companyId: string,
  input: CreateContactInput,
): Promise<EvaluatedContactDto> {
  return apiClient.post<EvaluatedContactDto>(`/companies/${companyId}/contacts`, input);
}
