import { useMemo } from 'react';
import type { CampaignDto, CampaignRecipientStatus } from '../../api/campaigns';
import type { CampaignRecipientSummaryDto } from '../../api/outreach';
import { MemberCard } from '../../features/campaign/components/MemberCard';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlayIcon, PauseIcon } from '@hugeicons/core-free-icons';

export type ReviewFilter =
  | 'ALL'
  | 'PENDING'
  | 'ACTIVE'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'SUPPRESSED';

const FILTER_LABELS: Record<ReviewFilter, string> = {
  ALL: 'All',
  PENDING: 'Needs Review',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  SUPPRESSED: 'Blocked',
};

const FILTER_ORDER: ReviewFilter[] = [
  'ALL',
  'PENDING',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'FAILED',
  'SUPPRESSED',
];

export interface CampaignReviewHubProps {
  campaign: CampaignDto;
  recipients: CampaignRecipientSummaryDto[];
  activeFilter: ReviewFilter;
  onFilterChange: (filter: ReviewFilter) => void;
  onOpenRecipient: (outreachId: string) => void;
  onPause: () => void;
  onResume: () => void;
  isPauseResumeLoading: boolean;
  companyName?: string;
  onOpenAssignSenders?: () => void;
}

const CAMPAIGN_STATUS_CFG: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  DRAFT: { color: '#374151', bg: '#F3F4F6', border: '#E5E7EB', dot: '#9CA3AF' },
  READY: { color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', dot: '#3B82F6' },
  SENDING: { color: '#92400E', bg: '#FEF3C7', border: '#FDE68A', dot: '#F59E0B' },
  ACTIVE: { color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0', dot: '#10B981' },
  PAUSED: { color: '#92400E', bg: '#FFF7ED', border: '#FED7AA', dot: '#F97316' },
  COMPLETED: { color: '#374151', bg: '#F3F4F6', border: '#E5E7EB', dot: '#6B7280' },
  SCHEDULED: { color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD', dot: '#38BDF8' },
  ARCHIVED: { color: '#6B7280', bg: '#F9FAFB', border: '#F3F4F6', dot: '#D1D5DB' },
};

function statusMatchesFilter(status: CampaignRecipientStatus, filter: ReviewFilter): boolean {
  if (filter === 'ALL') return true;
  return status === filter;
}

export function CampaignReviewHub({
  campaign,
  recipients,
  activeFilter,
  onFilterChange,
  onOpenRecipient,
  onPause,
  onResume,
  isPauseResumeLoading,
  companyName,
  onOpenAssignSenders,
}: CampaignReviewHubProps) {
  const filterCounts = useMemo(() => {
    const counts: Record<ReviewFilter, number> = {
      ALL: recipients.length,
      PENDING: 0,
      ACTIVE: 0,
      PAUSED: 0,
      COMPLETED: 0,
      FAILED: 0,
      SUPPRESSED: 0,
    };
    recipients.forEach((c) => {
      if (counts[c.status as ReviewFilter] !== undefined) {
        counts[c.status as ReviewFilter]++;
      }
    });
    return counts;
  }, [recipients]);

  const visibleRecipients = useMemo(
    () => recipients.filter((c) => statusMatchesFilter(c.status, activeFilter)),
    [recipients, activeFilter],
  );

  const total = recipients.length;
  const sent = recipients.filter((m) => ['ACTIVE', 'COMPLETED'].includes(m.status)).length;
  const activeCount = recipients.filter((m) => m.status === 'ACTIVE').length;
  const completedCount = recipients.filter((m) => m.status === 'COMPLETED').length;

  const cfg = CAMPAIGN_STATUS_CFG[campaign.status] || CAMPAIGN_STATUS_CFG['DRAFT'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[24px] font-bold tracking-tight" style={{ color: 'var(--color-primary, #111827)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              {campaign.name}
            </h2>
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-none-full"
              style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            >
              <span className="w-1.5 h-1.5 rounded-none-full" style={{ background: cfg.dot }} />
              {campaign.status}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {campaign.status === 'ACTIVE' && (
            <button
              type="button"
              onClick={onPause}
              disabled={isPauseResumeLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-none-none text-[13.5px] font-semibold  disabled:opacity-50"
              style={{ background: '#FFF7ED', color: '#9A3412', border: '1px solid #FFEDD5', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            >
              <HugeiconsIcon icon={PauseIcon} size={14} /> Pause Campaign
            </button>
          )}
          {campaign.status === 'PAUSED' && (
            <button
              type="button"
              onClick={onResume}
              disabled={isPauseResumeLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-none-none text-[13.5px] font-semibold  disabled:opacity-50"
              style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            >
              <HugeiconsIcon icon={PlayIcon} size={14} /> Resume Campaign
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Recipients', value: total, color: 'var(--color-primary, #111827)' },
          { label: 'In Progress', value: activeCount, color: '#8B5CF6' },
          { label: 'Completed', value: completedCount, color: '#10B981' },
          { label: 'Total Dispatched', value: sent, color: '#F59E0B' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-none-none p-4" style={{ background: 'var(--color-card, #ffffff)', border: '1px solid var(--color-border, #E5E7EB)' }}>
            <p className="text-[28px] font-bold leading-none mb-1" style={{ color: stat.color, fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              {stat.value}
            </p>
            <p className="text-[12px]" style={{ color: 'var(--color-muted-fg, #6B7280)', fontFamily: 'sans-serif' }}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Sender Review */}
      <div className="rounded-none-none p-4" style={{ background: 'var(--color-muted, #F3F4F6)', border: '1px solid var(--color-border, #E5E7EB)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11.5px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted-fg, #6B7280)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            Sender identity
          </p>
          {onOpenAssignSenders && (
            <button onClick={onOpenAssignSenders} className="text-[11.5px] font-medium" style={{ color: 'var(--color-accent, #4F46E5)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
              Change
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[11.5px] font-semibold w-14 shrink-0" style={{ color: 'var(--color-muted-fg, #6B7280)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>Identity</span>
            <span className="text-[13px]" style={{ color: 'var(--color-primary, #111827)', fontFamily: 'sans-serif' }}>{campaign.senders?.[0]?.fromEmail || 'Not assigned'}</span>
          </div>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 hide-scrollbar" role="tablist" aria-label="Filter recipients">
        {FILTER_ORDER.map((filter) => {
          if (filter !== 'ALL' && filterCounts[filter] === 0) return null;
          const isActive = activeFilter === filter;
          return (
            <button
              key={filter}
              role="tab"
              onClick={() => onFilterChange(filter)}
              aria-selected={isActive}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-3 py-1.5 rounded-none-full  cursor-pointer whitespace-nowrap"
              style={{
                background: isActive ? 'var(--color-primary, #111827)' : 'var(--color-card, #ffffff)',
                color: isActive ? 'white' : 'var(--color-muted-fg, #6B7280)',
                border: `1px solid ${isActive ? 'var(--color-primary, #111827)' : 'var(--color-border, #E5E7EB)'}`,
                fontFamily: '"Plus Jakarta Sans", sans-serif',
              }}
            >
              {FILTER_LABELS[filter]}
              <span className="opacity-70">({filterCounts[filter]})</span>
            </button>
          );
        })}
      </div>

      {/* Recipient Grid */}
      {visibleRecipients.length === 0 ? (
        <div className="py-12 text-center" style={{ background: 'var(--color-card, #ffffff)', border: '1px solid var(--color-border, #E5E7EB)', borderRadius: '12px' }}>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--color-primary, #111827)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            No recipients found
          </p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-muted-fg, #6B7280)', fontFamily: 'sans-serif' }}>
            Try selecting a different status filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleRecipients.map((recipient) => (
            <MemberCard
              key={recipient.id}
              member={recipient}
              companyName={companyName || 'Unknown'}
              onOpenRecipient={() => onOpenRecipient(recipient.outreachId || recipient.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
