import { Workspace } from "../../lib/auth-context";

export interface DegradedSourceDto {
  source: string;
  code: string;
}

export type WorkItemKind =
  | 'OUTREACH_REVIEW'
  | 'SEND_FAILURE'
  | 'RESEARCH_INCOMPLETE'
  | 'CAMPAIGN_PAUSED';

export interface WorkspaceWorkItemDto {
  id: string;
  kind: WorkItemKind;
  company: {
    id: string;
    name: string;
  };
  campaign?: {
    id: string;
    name: string;
    status: string;
  };
  campaignMember?: {
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

export type ActivityType =
  | 'RESEARCH_COMPLETED'
  | 'CONTACT_SELECTED'
  | 'EMAIL_SENT'
  | 'OUTCOME_RECORDED';

export interface WorkspaceActivityItemDto {
  id: string;
  sourceType: string;
  sourceId: string;
  type: ActivityType;
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

export interface WorkspaceSummaryDto {
  workspace: Pick<Workspace, 'id'>;
  workItems: WorkspaceWorkItemDto[];
  recentActivity: WorkspaceActivityItemDto[];
  degradedSources?: DegradedSourceDto[];
  generatedAt: string;
}

export interface AttentionItemViewModel {
  id: string;
  kind: 'OUTREACH_REVIEW' | 'SEND_FAILURE';
  title: string;
  companyName: string;
  companyId: string;
  campaignName?: string;
  campaignId?: string;
  description: string;
  actionLabel: string;
  badgeLabel: string;
  badgeClasses: string;
  destination: {
    to: string;
    params?: Record<string, string>;
  };
}

export interface ContinueWorkingItemViewModel {
  id: string;
  kind: 'RESEARCH_INCOMPLETE' | 'CAMPAIGN_PAUSED';
  companyName: string;
  companyId: string;
  campaignName?: string;
  campaignId?: string;
  stateLabel: string;
  nextActionLabel: string;
  actionLabel: string;
  badgeLabel: string;
  badgeClasses: string;
  destination: {
    to: string;
    params?: Record<string, string>;
  };
}

export interface RecentActivityItemViewModel {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  occurredAt: string;
  relativeTime: string;
}

export interface HomeViewModel {
  attentionItems: AttentionItemViewModel[];
  continueItems: ContinueWorkingItemViewModel[];
  recentActivity: RecentActivityItemViewModel[];
  workDegraded: boolean;
  activityDegraded: boolean;
  isEmptyWorkspace: boolean;
}
