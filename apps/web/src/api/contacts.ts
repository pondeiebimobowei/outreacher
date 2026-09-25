import { apiClient } from './client';
import type { 
  EvaluatedContactDto, 
  CompanyContactsResponse, 
  DiscoverContactsResponse, 
  CreateContactRequest,
  ContactKind,
  ContactRelevance,
  EmailConfidenceStatus
} from '@repo/shared';

export type { 
  EvaluatedContactDto, 
  CompanyContactsResponse, 
  DiscoverContactsResponse, 
  CreateContactRequest,
  ContactKind,
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

export async function createCompanyContact(
  companyId: string,
  input: CreateContactRequest,
): Promise<EvaluatedContactDto> {
  return apiClient.post<EvaluatedContactDto>(`/companies/${companyId}/contacts`, input);
}
