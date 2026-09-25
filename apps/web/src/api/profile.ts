import { apiClient } from './client';

export interface CareerProfileDto {
  id: string;
  workspaceId: string;
  headline?: string | null;
  summary?: string | null;
  targetRoles: string[];
  targetIndustries: string[];
  targetLocations: string[];
  skills: string[];
  experienceSummary?: string | null;
  portfolioUrl?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  websiteUrl?: string | null;
  currentRole?: string | null;
  yearsExperience?: string | null;
  careerGoals?: string | null;
  backgroundAndPositioning?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchCareerProfile(): Promise<CareerProfileDto | null> {
  try {
    return await apiClient.get<CareerProfileDto>('/profile');
  } catch {
    return null;
  }
}
