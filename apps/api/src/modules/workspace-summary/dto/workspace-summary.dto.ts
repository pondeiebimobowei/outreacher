export interface WorkspaceSummaryDto {
  workspace: {
    id: string;
  };
  workItems: WorkspaceWorkItemDto[];
  recentActivity: WorkspaceActivityItemDto[];
  degradedSources?: DegradedSourceDto[];
  generatedAt: string;
}

export interface DegradedSourceDto {
  source: string;
  code: string;
}

export interface WorkspaceWorkItemDto {
  id: string;
  kind:
    | 'OUTREACH_REVIEW'
    | 'SEND_FAILURE'
    | 'RESEARCH_INCOMPLETE'
    | 'CAMPAIGN_PAUSED';
  company: {
    id: string;
    name: string;
  };
  campaign?: {
    id: string;
    name: string;
    status: string;
  };
  campaignContact?: {
    id: string;
    status: string;
  };
  occurredAt?: string;
  updatedAt?: string;
  source: {
    domain: 'RESEARCH' | 'CONTACT' | 'OUTREACH' | 'CAMPAIGN' | 'EMAIL';
    state: string;
  };
  destination: {
    type: 'COMPANY' | 'CONTACT_REVIEW' | 'CAMPAIGN';
  };
}

export interface WorkspaceActivityItemDto {
  id: string;
  sourceType: string;
  sourceId: string;
  type:
    | 'RESEARCH_COMPLETED'
    | 'CONTACT_SELECTED'
    | 'EMAIL_SENT'
    | 'OUTCOME_RECORDED';
  company?: {
    id: string;
    name: string;
  };
  campaign?: {
    id: string;
    name: string;
  };
  occurredAt: string;
}
