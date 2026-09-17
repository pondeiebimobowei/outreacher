import { Company, CompanyStatus } from '@repo/db';

export interface CreateCompanyData {
  workspaceId: string;
  name: string;
  normalizedName: string;
  websiteUrl?: string | null;
  domain?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
  status?: CompanyStatus;
}

export interface UpdateCompanyData {
  name?: string;
  normalizedName?: string;
  websiteUrl?: string | null;
  domain?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
  status?: CompanyStatus;
}

export interface ICompanyRepository {
  create(data: CreateCompanyData): Promise<Company>;
  findById(workspaceId: string, id: string): Promise<Company | null>;
  findByNormalizedName(
    workspaceId: string,
    normalizedName: string,
  ): Promise<Company | null>;
  findManyByWorkspace(workspaceId: string): Promise<Company[]>;
  update(
    workspaceId: string,
    id: string,
    data: UpdateCompanyData,
  ): Promise<Company | null>;
}

export const COMPANY_REPOSITORY_TOKEN = 'ICompanyRepository';
