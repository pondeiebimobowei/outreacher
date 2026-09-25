export interface CareerProfileDomain {
  id: string;
  workspaceId: string;
  headline: string | null;
  summary: string | null;
  experienceSummary: string | null;
  targetRoles: string[];
  targetIndustries: string[];
  targetLocations: string[];
  skills: string[];
  portfolioUrl: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  currentRole: string | null;
  yearsExperience: string | null;
  careerGoals: string | null;
  backgroundAndPositioning: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CareerProfileChanges = {
  headline?: string | null;
  summary?: string | null;
  experienceSummary?: string | null;
  targetRoles?: string[];
  targetIndustries?: string[];
  targetLocations?: string[];
  skills?: string[];
  portfolioUrl?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  websiteUrl?: string | null;
  currentRole?: string | null;
  yearsExperience?: string | null;
  careerGoals?: string | null;
  backgroundAndPositioning?: string | null;
};
