export const COMPANY_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type CompanyStatus = typeof COMPANY_STATUSES[number];

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

export interface CreateCompanyRequest {
  name: string;
  websiteUrl?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
}

export interface UpdateCompanyRequest {
  name?: string;
  websiteUrl?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
  status?: CompanyStatus;
}
