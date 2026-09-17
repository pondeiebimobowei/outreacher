import { apiClient } from './client';

export interface ResearchRunDto {
  id: string;
  workspaceId: string;
  companyId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  summary?: string | null;
  keyFindings?: string[] | null;
  openQuestions?: string[] | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityDto {
  id: string;
  workspaceId: string;
  companyId: string;
  researchRunId?: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'SUPERSEDED';
  roleTitle: string;
  opportunityType: string;
  openingSourceUrl?: string | null;
  roleUrl?: string | null;
  roleLocation?: string | null;
  roleDescription?: string | null;
  openingDiscoveredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceDto {
  id: string;
  workspaceId: string;
  companyId: string;
  researchRunId?: string | null;
  claim: string;
  classification: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourceExcerpt?: string | null;
  confidence?: number | null;
  collectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyResearchDetailsDto {
  run: ResearchRunDto | null;
  opportunities: OpportunityDto[];
  evidence: EvidenceDto[];
  status: 'NOT_STARTED' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  jobStatus: string | null;
  mock: boolean;
}

export interface StartResearchResultDto {
  researchRun: ResearchRunDto;
  reused: boolean;
}

export async function startCompanyResearch(
  companyId: string,
  options?: { forceRefresh?: boolean },
): Promise<StartResearchResultDto> {
  return apiClient.post<StartResearchResultDto>(`/companies/${companyId}/research`, options ?? {});
}

export async function fetchCompanyResearch(companyId: string): Promise<CompanyResearchDetailsDto> {
  return apiClient.get<CompanyResearchDetailsDto>(`/companies/${companyId}/research`);
}
