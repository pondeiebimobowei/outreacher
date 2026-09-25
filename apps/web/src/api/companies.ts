import { apiClient } from './client';
import type { CompanyDto, CreateCompanyRequest, UpdateCompanyRequest, CompanyStatus } from '@repo/shared';

export type { CompanyDto, CreateCompanyRequest, UpdateCompanyRequest, CompanyStatus };

export async function fetchCompanies(): Promise<CompanyDto[]> {
  return apiClient.get<CompanyDto[]>('/companies');
}

export async function fetchCompanyById(id: string): Promise<CompanyDto> {
  return apiClient.get<CompanyDto>(`/companies/${id}`);
}

export async function createCompany(input: CreateCompanyRequest): Promise<CompanyDto> {
  return apiClient.post<CompanyDto>('/companies', input);
}

export async function updateCompany(id: string, input: UpdateCompanyRequest): Promise<CompanyDto> {
  return apiClient.patch<CompanyDto>(`/companies/${id}`, input);
}
