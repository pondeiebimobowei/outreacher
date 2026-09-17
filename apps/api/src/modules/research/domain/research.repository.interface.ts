import { ResearchRun } from '@repo/db';
import { CompanyResearchResult } from './research.provider.interface';

export interface StartResearchOptions {
  companyId: string;
  workspaceId: string;
  forceRefresh?: boolean;
}

export interface StartResearchResult {
  researchRun: ResearchRun;
  reused: boolean;
}

export const RESEARCH_REPOSITORY_TOKEN = 'RESEARCH_REPOSITORY';

export interface IResearchRepository {
  /**
   * Atomically admits or reuses a research run for a company.
   */
  startResearch(options: StartResearchOptions): Promise<StartResearchResult>;

  /**
   * Finds latest active or completed research run for a company in workspace.
   */
  findLatestRun(
    workspaceId: string,
    companyId: string,
  ): Promise<ResearchRun | null>;

  /**
   * Finds a research run by ID.
   */
  findRunById(workspaceId: string, id: string): Promise<ResearchRun | null>;

  /**
   * Updates ResearchRun status and metadata.
   */
  updateRunStatus(
    workspaceId: string,
    id: string,
    status: 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED',
    data?: {
      startedAt?: Date;
      completedAt?: Date;
      errorCode?: string;
      errorMessage?: string;
    },
  ): Promise<ResearchRun>;

  /**
   * Atomically completes research run and reconciles Opportunities and Evidence.
   */
  completeResearchRun(
    workspaceId: string,
    researchRunId: string,
    result: CompanyResearchResult,
  ): Promise<ResearchRun>;
}
