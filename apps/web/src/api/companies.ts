import { apiClient } from './client';

export type CompanyStatus = 'ACTIVE' | 'ARCHIVED';

export interface CompanyDto {
  id: string;
  workspaceId: string;
  name: string;
  normalizedName: string;
  websiteUrl: string | null;
  domain: string | null;
  description: string | null;
  industry: string | null;
  location: string | null;
  linkedinUrl: string | null;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyInput {
  name: string;
  websiteUrl?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
}

export interface UpdateCompanyInput {
  name?: string;
  websiteUrl?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
  status?: CompanyStatus;
}

export async function fetchCompanies(): Promise<CompanyDto[]> {
  return apiClient.get<CompanyDto[]>('/companies');
}

export async function fetchCompanyById(id: string): Promise<CompanyDto> {
  return apiClient.get<CompanyDto>(`/companies/${id}`);
}

export async function createCompany(input: CreateCompanyInput): Promise<CompanyDto> {
  return apiClient.post<CompanyDto>('/companies', input);
}

export async function updateCompany(id: string, input: UpdateCompanyInput): Promise<CompanyDto> {
  return apiClient.patch<CompanyDto>(`/companies/${id}`, input);
}
