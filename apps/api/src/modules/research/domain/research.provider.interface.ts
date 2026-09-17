export interface CompanyResearchInput {
  companyId: string;
  workspaceId: string;
  companyName: string;
  websiteUrl?: string | null;
  domain?: string | null;
  industry?: string | null;
}

export interface ResearchFinding {
  title: string;
  detail: string;
  whyItMatters?: string;
  sourceUrl?: string;
}

export interface ResearchSource {
  name: string;
  url: string;
  tier: 'TIER_1' | 'TIER_2' | 'TIER_3';
}

export interface ResearchOpportunityInput {
  roleTitle: string;
  openingSourceUrl?: string | null;
  roleUrl?: string | null;
  roleLocation?: string | null;
  roleDescription?: string | null;
  opportunityType: 'CONFIRMED' | 'PROACTIVE';
}

export interface ResearchEvidenceInput {
  claim: string;
  classification: 'FACT' | 'INFERENCE' | 'UNKNOWN';
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourceExcerpt?: string | null;
  confidence?: string | null;
}

export interface CompanyResearchResult {
  summary: string;
  findings: ResearchFinding[];
  sources: ResearchSource[];
  opportunities: ResearchOpportunityInput[];
  evidence: ResearchEvidenceInput[];
  unknowns: string[];
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
}

export const COMPANY_RESEARCH_PROVIDER_TOKEN = 'COMPANY_RESEARCH_PROVIDER';

export interface CompanyResearchProvider {
  researchCompany(input: CompanyResearchInput): Promise<CompanyResearchResult>;
}
