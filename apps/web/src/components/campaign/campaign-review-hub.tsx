import React from 'react';
import type { CampaignDto, CampaignContactStatus } from '../../api/campaigns';
import type { CampaignContactSummaryDto } from '../../api/outreach';

// ─── Status display helpers ──────────────────────────────────────────────────

export type ReviewFilter =
  | 'ALL'
  | 'PENDING'
  | 'READY'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'SUPPRESSED';

const FILTER_LABELS: Record<ReviewFilter, string> = {
  ALL: 'All',
  PENDING: 'Needs Review',
  READY: 'Approved',
  SENDING: 'Sending',
  SENT: 'Sent',
  FAILED: 'Failed',
  SUPPRESSED: 'Blocked',
};

const FILTER_ORDER: ReviewFilter[] = [
  'ALL',
  'PENDING',
  'READY',
  'SENDING',
  'SENT',
  'FAILED',
  'SUPPRESSED',
];

function statusMatchesFilter(
  status: CampaignContactStatus,
  filter: ReviewFilter,
): boolean {
  if (filter === 'ALL') return true;
  return status === filter;
}

function getStatusBadge(status: CampaignContactStatus): React.ReactElement {
  switch (status) {
    case 'PENDING':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
          Needs Review
        </span>
      );
    case 'READY':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
          Approved
        </span>
      );
    case 'SENDING':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200 animate-pulse">
          Sending
        </span>
      );
    case 'SENT':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
          Sent
        </span>
      );
    case 'FAILED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
          Failed
        </span>
      );
    case 'SUPPRESSED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
          Blocked
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-50 text-slate-500 border border-slate-200">
          {status}
        </span>
      );
  }
}

/**
 * Returns the hub action label for a given CampaignContact status.
 *
 * FAILED is terminal — no Retry. FAILED, SENT, SENDING, SUPPRESSED all get View.
 * Other lifecycle states (SCHEDULED, FOLLOW_UP_DUE, REPLIED, COMPLETED, ARCHIVED)
 * have no hub-invented action and return null.
 */
export function getHubActionLabel(
  status: CampaignContactStatus,
): string | null {
  switch (status) {
    case 'PENDING':
      return 'Review Draft';
    case 'READY':
      return 'Send Now';
    case 'SENDING':
    case 'SENT':
    case 'FAILED':      // Terminal — View only, never Retry (Packet 5 invariant)
    case 'SUPPRESSED':
      return 'View';
    default:
      return null;
  }
}

function formatRelativeTime(dateString: string | null | undefined): string {
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

// ─── Props ───────────────────────────────────────────────────────────────────

export interface CampaignReviewHubProps {
  campaign: CampaignDto;
  contacts: CampaignContactSummaryDto[];
  activeFilter: ReviewFilter;
  onFilterChange: (filter: ReviewFilter) => void;
  onOpenContact: (campaignContactId: string) => void;
  onPause: () => void;
  onResume: () => void;
  isPauseResumeLoading: boolean;
  companyName?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CampaignReviewHub({
  campaign,
  contacts,
  activeFilter,
  onFilterChange,
  onOpenContact,
  onPause,
  onResume,
  isPauseResumeLoading,
}: CampaignReviewHubProps) {
  // Filter counts always computed from the complete collection
  const filterCounts = React.useMemo(() => {
    const counts: Record<ReviewFilter, number> = {
      ALL: contacts.length,
      PENDING: 0,
      READY: 0,
      SENDING: 0,
      SENT: 0,
      FAILED: 0,
      SUPPRESSED: 0,
    };
    for (const c of contacts) {
      switch (c.status) {
        case 'PENDING':    counts.PENDING++;    break;
        case 'READY':      counts.READY++;      break;
        case 'SENDING':    counts.SENDING++;    break;
        case 'SENT':       counts.SENT++;       break;
        case 'FAILED':     counts.FAILED++;     break;
        case 'SUPPRESSED': counts.SUPPRESSED++; break;
      }
    }
    return counts;
  }, [contacts]);

  // Filtered view — counts still come from the complete collection above
  const visibleContacts = React.useMemo(
    () =>
      activeFilter === 'ALL'
        ? contacts
        : contacts.filter((c) => statusMatchesFilter(c.status, activeFilter)),
    [contacts, activeFilter],
  );

  return (
    <div className="space-y-6">
      {/* ── Campaign Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {campaign.name}
          </h1>
          <div className="flex items-center gap-2">
            {getCampaignStatusBadge(campaign.status)}
            {campaign.sendingIdentity && (
              <span className="text-xs text-slate-500 font-mono">
                {campaign.sendingIdentity}
              </span>
            )}
          </div>
        </div>

        {/* Pause / Resume — campaign-level controls only */}
        {campaign.status === 'ACTIVE' && (
          <button
            type="button"
            onClick={onPause}
            disabled={isPauseResumeLoading}
            className="self-start bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-md px-3 py-1.5 text-xs font-medium min-h-[36px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Pause campaign"
          >
            {isPauseResumeLoading ? 'Pausing…' : 'Pause Campaign'}
          </button>
        )}
        {campaign.status === 'PAUSED' && (
          <button
            type="button"
            onClick={onResume}
            disabled={isPauseResumeLoading}
            className="self-start bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-md px-3 py-1.5 text-xs font-medium min-h-[36px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Resume campaign"
          >
            {isPauseResumeLoading ? 'Resuming…' : 'Resume Campaign'}
          </button>
        )}
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Filter contacts by status"
        className="flex flex-wrap gap-2"
      >
        {FILTER_ORDER.map((filter) => {
          const isActive = activeFilter === filter;
          return (
            <button
              key={filter}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onFilterChange(filter)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors min-h-[32px] ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {FILTER_LABELS[filter]} {filterCounts[filter]}
            </button>
          );
        })}
      </div>

      {/* ── Contact Queue ────────────────────────────────────────────────── */}
      {visibleContacts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-sm font-medium text-slate-700">
            No contacts in this view
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {activeFilter === 'ALL'
              ? 'This campaign has no contacts yet.'
              : `No contacts with status "${FILTER_LABELS[activeFilter]}".`}
          </p>
        </div>
      ) : (
        <>
          {/* ── Desktop / Tablet Table (≥ 640px) ── */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Contact / Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Opportunity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Last Updated
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {visibleContacts.map((contact) => {
                  const actionLabel = getHubActionLabel(contact.status);
                  return (
                    <tr
                      key={contact.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 text-xs">
                          {contact.contact.name}
                        </p>
                        {contact.contact.title && (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {contact.contact.title}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {contact.targetRole ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(contact.status)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatRelativeTime(contact.updatedAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {actionLabel ? (
                          <button
                            type="button"
                            onClick={() => onOpenContact(contact.id)}
                            className="bg-slate-900 text-white hover:bg-slate-800 rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 min-h-[32px]"
                          >
                            {actionLabel}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Mobile Cards (< 640px) ── */}
          <div className="sm:hidden space-y-3">
            {visibleContacts.map((contact) => {
              const actionLabel = getHubActionLabel(contact.status);
              return (
                <div
                  key={contact.id}
                  className="p-4 bg-white border border-slate-200 rounded-xl space-y-2.5 shadow-xs"
                >
                  {/* Top row: name + status */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-slate-900 text-sm">
                      {contact.contact.name}
                    </p>
                    {getStatusBadge(contact.status)}
                  </div>

                  {/* Opportunity / title row */}
                  {(contact.contact.title || contact.targetRole) && (
                    <p className="text-xs text-slate-600">
                      {[contact.contact.title, contact.targetRole]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}

                  {/* Outreach reason excerpt */}
                  {contact.outreachReason && (
                    <p className="text-xs text-slate-500 italic line-clamp-2">
                      {contact.outreachReason}
                    </p>
                  )}

                  {/* Primary action */}
                  {actionLabel && (
                    <button
                      type="button"
                      onClick={() => onOpenContact(contact.id)}
                      className="w-full py-2.5 min-h-[44px] bg-slate-900 text-white text-xs font-semibold rounded-md transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      {actionLabel}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Campaign status badge ────────────────────────────────────────────────────

function getCampaignStatusBadge(status: CampaignDto['status']): React.ReactElement {
  switch (status) {
    case 'ACTIVE':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
          Active
        </span>
      );
    case 'PAUSED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
          Paused
        </span>
      );
    case 'DRAFT':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
          Draft
        </span>
      );
    case 'ARCHIVED':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
          Archived
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
          {status}
        </span>
      );
  }
}
