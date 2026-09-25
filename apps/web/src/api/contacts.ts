import { apiClient } from './client';
import type {

  EvaluatedPersonDto,
  CompanyContactsResponse,
  DiscoverContactsResponse,

  CreateContactRequest,
  ContactRelevance,
  EmailConfidenceStatus
} from '@repo/shared';

export const PERSON_KINDS = ['PERSON', 'ROLE_ADDRESS'] as const;
export type PersonKind = typeof PERSON_KINDS[number];

export type {
  EvaluatedPersonDto,
  CompanyContactsResponse,
  DiscoverContactsResponse,
  CreateContactRequest,

  ContactRelevance,
  EmailConfidenceStatus
};

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

export async function fetchContactById(contactId: string): Promise<EvaluatedPersonDto> {
  return apiClient.get<EvaluatedPersonDto>(`/contacts/${contactId}`);
}

export async function selectCompanyContact(
  companyId: string,
  contactId: string,
): Promise<{ id: string; companyId: string; contactId: string; selectedAt: string }> {
  return apiClient.post<{ id: string; companyId: string; contactId: string; selectedAt: string }>(
    `/companies/${companyId}/contacts/${contactId}/select`,
  );
}

export async function createCompanyContact(
  companyId: string,
  input: CreateContactRequest,
): Promise<EvaluatedPersonDto> {
  return apiClient.post<EvaluatedPersonDto>(`/companies/${companyId}/contacts`, input);
}
