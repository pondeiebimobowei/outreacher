import {
  AttentionItemViewModel,
  ContinueWorkingItemViewModel,
  HomeViewModel,
  RecentActivityItemViewModel,
  WorkspaceActivityItemDto,
  WorkspaceSummaryDto,
  WorkspaceWorkItemDto,
} from './home.types';

export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';
  const now = new Date();
  const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSeconds < 0) return date.toLocaleDateString();
  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function mapWorkItemToAttention(item: WorkspaceWorkItemDto): AttentionItemViewModel | null {
  if (item.kind === 'OUTREACH_REVIEW') {
    const destination: { to: string; params?: Record<string, string> } = item.campaign?.id
      ? { to: '/campaigns/$campaignId/review', params: { campaignId: item.campaign.id } }
      : { to: '/companies/$id', params: { id: item.company.id } };

    return {
      id: item.id,
      kind: 'OUTREACH_REVIEW',
      title: 'Outreach Review',
      companyName: item.company.name,
      companyId: item.company.id,
      campaignName: item.campaign?.name,
      campaignId: item.campaign?.id,
      description: item.campaign?.name
        ? `Outreach draft for ${item.company.name} in "${item.campaign.name}" awaits human review.`
        : `Outreach draft for ${item.company.name} awaits human review.`,
      actionLabel: 'Review Outreach',
      badgeLabel: 'Review Required',
      badgeClasses: 'bg-amber-50 text-amber-900 border-amber-200',
      destination,
    };
  }

  if (item.kind === 'SEND_FAILURE') {
    const destination: { to: string; params?: Record<string, string> } = item.campaign?.id
      ? { to: '/campaigns/$campaignId/review', params: { campaignId: item.campaign.id } }
      : { to: '/campaigns' };

    return {
      id: item.id,
      kind: 'SEND_FAILURE',
      title: 'Delivery Failure',
      companyName: item.company.name,
      companyId: item.company.id,
      campaignName: item.campaign?.name,
      campaignId: item.campaign?.id,
      description: item.campaign?.name
        ? `Email dispatch to contact at ${item.company.name} failed in "${item.campaign.name}".`
        : `Email dispatch to contact at ${item.company.name} failed.`,
      actionLabel: 'Investigate Failure',
      badgeLabel: 'Send Failed',
      badgeClasses: 'bg-red-50 text-red-900 border-red-200',
      destination,
    };
  }

  return null;
}

export function mapWorkItemToContinue(item: WorkspaceWorkItemDto): ContinueWorkingItemViewModel | null {
  if (item.kind === 'RESEARCH_INCOMPLETE') {
    return {
      id: item.id,
      kind: 'RESEARCH_INCOMPLETE',
      companyName: item.company.name,
      companyId: item.company.id,
      campaignName: item.campaign?.name,
      campaignId: item.campaign?.id,
      stateLabel: 'Research in progress',
      nextActionLabel: 'Review company evidence and evaluate opportunities',
      actionLabel: 'Continue Research',
      badgeLabel: 'Research In Progress',
      badgeClasses: 'bg-sky-50 text-sky-800 border-sky-200',
      destination: { to: '/companies/$id', params: { id: item.company.id } },
    };
  }

  if (item.kind === 'CAMPAIGN_PAUSED') {
    const destination: { to: string; params?: Record<string, string> } = item.campaign?.id
      ? { to: '/campaigns/$campaignId/review', params: { campaignId: item.campaign.id } }
      : { to: '/campaigns' };

    return {
      id: item.id,
      kind: 'CAMPAIGN_PAUSED',
      companyName: item.company.name,
      companyId: item.company.id,
      campaignName: item.campaign?.name,
      campaignId: item.campaign?.id,
      stateLabel: 'Campaign paused',
      nextActionLabel: 'Resume campaign dispatch or review queued contacts',
      actionLabel: 'Review Campaign',
      badgeLabel: 'Paused',
      badgeClasses: 'bg-slate-100 text-slate-800 border-slate-300',
      destination,
    };
  }

  return null;
}

export function mapActivityItem(item: WorkspaceActivityItemDto): RecentActivityItemViewModel {
  const relativeTime = formatRelativeTime(item.occurredAt);
  const companyName = item.company?.name ?? 'company';

  switch (item.type) {
    case 'RESEARCH_COMPLETED':
      return {
        id: item.id,
        type: item.type,
        title: 'Research Completed',
        description: `Completed deep company research for ${companyName}.`,
        occurredAt: item.occurredAt,
        relativeTime,
      };
    case 'CONTACT_SELECTED':
      return {
        id: item.id,
        type: item.type,
        title: 'Contact Selected',
        description: `Selected target contact for outreach at ${companyName}.`,
        occurredAt: item.occurredAt,
        relativeTime,
      };
    case 'EMAIL_SENT':
      return {
        id: item.id,
        type: item.type,
        title: 'Email Sent',
        description: item.campaign?.name
          ? `Dispatched outreach email to contact at ${companyName} (${item.campaign.name}).`
          : `Dispatched outreach email to contact at ${companyName}.`,
        occurredAt: item.occurredAt,
        relativeTime,
      };
    case 'OUTCOME_RECORDED':
      return {
        id: item.id,
        type: item.type,
        title: 'Outcome Recorded',
        description: `Recorded opportunity outcome for ${companyName}.`,
        occurredAt: item.occurredAt,
        relativeTime,
      };
  }
}

export function mapWorkspaceSummaryToViewModel(summary: WorkspaceSummaryDto): HomeViewModel {
  const attentionItems: AttentionItemViewModel[] = [];
  const continueItems: ContinueWorkingItemViewModel[] = [];

  for (const item of summary.workItems) {
    const attention = mapWorkItemToAttention(item);
    if (attention) {
      attentionItems.push(attention);
      continue;
    }

    const cont = mapWorkItemToContinue(item);
    if (cont) {
      continueItems.push(cont);
      continue;
    }
  }

  const recentActivity = (summary.recentActivity ?? []).map(mapActivityItem);

  const degradedSources = summary.degradedSources ?? [];
  const workDegraded = degradedSources.some((d) => d.source.startsWith('WORK_'));
  const activityDegraded = degradedSources.some((d) => d.source.startsWith('ACTIVITY_'));

  const isEmptyWorkspace =
    summary.workItems.length === 0 &&
    summary.recentActivity.length === 0 &&
    degradedSources.length === 0;

  return {
    attentionItems,
    continueItems,
    recentActivity,
    workDegraded,
    activityDegraded,
    isEmptyWorkspace,
  };
}
