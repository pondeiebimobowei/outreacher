import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchCampaigns, CampaignStatus } from '../../api/campaigns';
import { LoadingState, ErrorState } from '../../components/states';
import { HugeiconsIcon } from '@hugeicons/react';
import { SendIcon, SearchIcon, ArrowRightIcon, MailIcon, InfoIcon } from '@hugeicons/core-free-icons';;

export const Route = createFileRoute('/_authed/outreaches/')({
  component: OutreachesIndexComponent,
});

const STATUS_CFG: Record<
  string,
  { label: string; color: string; bg: string; border: string; dot: string }
> = {
  ACTIVE: {
    label: 'Active',
    color: '#065F46',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    dot: '#10B981',
  },
  DRAFT: {
    label: 'Draft',
    color: '#374151',
    bg: '#F3F4F6',
    border: '#D1D5DB',
    dot: '#9CA3AF',
  },
  PAUSED: {
    label: 'Paused',
    color: '#78350F',
    bg: '#FFFBEB',
    border: '#FDE68A',
    dot: '#F59E0B',
  },
  SCHEDULED: {
    label: 'Scheduled',
    color: '#1E40AF',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    dot: '#3B82F6',
  },
  COMPLETED: {
    label: 'Completed',
    color: '#5B21B6',
    bg: '#F5F3FF',
    border: '#DDD6FE',
    dot: '#8B5CF6',
  },
  ARCHIVED: {
    label: 'Archived',
    color: '#374151',
    bg: '#F3F4F6',
    border: '#D1D5DB',
    dot: '#6B7280',
  },
};

type FilterStatus = 'ALL' | CampaignStatus;

function OutreachesIndexComponent() {
  const {
    data: campaigns,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
  });

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('ALL');

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <LoadingState message="Loading outreaches..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <ErrorState message="Failed to load campaigns." />
      </div>
    );
  }

  const allCampaigns = campaigns ?? [];

  const counts: Record<string, number> = {
    ALL: allCampaigns.length,
    ACTIVE: allCampaigns.filter((c) => c.status === 'ACTIVE').length,
    DRAFT: allCampaigns.filter((c) => c.status === 'DRAFT').length,
    COMPLETED: allCampaigns.filter((c) => c.status === 'COMPLETED').length,
    PAUSED: allCampaigns.filter((c) => c.status === 'PAUSED').length,
  };

  const filtered = allCampaigns.filter((c) => {
    const matchesSearch =
      search.trim() === '' ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.senders?.[0]?.fromEmail &&
        c.senders[0].fromEmail.toLowerCase().includes(search.toLowerCase()));
    const matchesFilter = filter === 'ALL' || c.status === filter;
    return matchesSearch && matchesFilter;
  });

  const availableFilters = (
    [
      { key: 'ALL', label: 'All' },
      { key: 'ACTIVE', label: 'Active' },
      { key: 'DRAFT', label: 'Draft' },
      { key: 'COMPLETED', label: 'Completed' },
      { key: 'PAUSED', label: 'Paused' },
    ] as { key: FilterStatus; label: string }[]
  ).filter((f) => f.key === 'ALL' || (counts[f.key] ?? 0) > 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1
            className="text-[24px] font-bold tracking-tight"
            style={{
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              color: 'var(--color-primary)',
            }}
          >
            Outreaches
          </h1>
          <p
            className="text-[14px] mt-1"
            style={{
              color: 'var(--color-muted-fg)',
              fontFamily: 'sans-serif',
            }}
          >
            Outreach messages and contact delivery are managed across campaigns.
          </p>
        </div>
      </div>

      {/* Info note */}
      <div
        className="mb-6 p-4 rounded-none-none flex items-start gap-3"
        style={{
          background: 'var(--color-muted)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div
          className="w-8 h-8 rounded-none-none flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: '#EEF2FF', color: '#4F46E5' }}
        >
          <HugeiconsIcon icon={InfoIcon} size={16} />
        </div>
        <div>
          <p
            className="text-[13px] font-semibold mb-0.5"
            style={{
              color: 'var(--color-primary)',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}
          >
            Campaign-Driven Outreach
          </p>
          <p
            className="text-[12.5px] leading-relaxed"
            style={{
              color: 'var(--color-muted-fg)',
              fontFamily: 'sans-serif',
            }}
          >
            Outreaches are prepared, reviewed, and dispatched through campaigns.
            Select a campaign below to review drafts, approve messaging, and
            manage outreach delivery.
          </p>
        </div>
      </div>

      {allCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-5 py-20 px-8 text-center bg-slate-50 rounded-none-none border border-slate-200">
          <div
            className="w-12 h-12 rounded-none-none flex items-center justify-center"
            style={{
              background: 'var(--color-muted)',
              color: 'var(--color-muted-fg)',
            }}
          >
            <HugeiconsIcon icon={SendIcon} size={22} strokeWidth={1.6} />
          </div>
          <div className="max-w-md">
            <h2
              className="text-[18px] font-bold mb-1"
              style={{
                color: 'var(--color-primary)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}
            >
              No outreach campaigns yet
            </h2>
            <p
              className="text-[13.5px] leading-relaxed"
              style={{
                color: 'var(--color-muted-fg)',
                fontFamily: 'sans-serif',
              }}
            >
              Create a campaign and add contacts to start drafting and sending
              personalized outreaches.
            </p>
          </div>
          <Link
            to="/campaigns"
            className="px-4 py-2 rounded-none-none text-[13px] font-semibold text-white -opacity inline-flex items-center gap-1.5"
            style={{
              background: 'var(--color-primary)',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}
          >
            Go to Campaigns <HugeiconsIcon icon={ArrowRightIcon} size={14} />
          </Link>
        </div>
      ) : (
        <>
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="flex-1 relative">
              <span
                className="absolute left-3.5 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--color-muted-fg)' }}
              >
                <HugeiconsIcon icon={SearchIcon} size={15} />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search campaigns by name or sender..."
                className="w-full pl-10 pr-3.5 py-2 rounded-none-none text-[13.5px] outline-none "
                style={{
                  background: 'var(--color-muted)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-primary)',
                  fontFamily: 'sans-serif',
                }}
              />
            </div>

            {/* Filter pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {availableFilters.map((f) => {
                const isActive = filter === f.key;
                const count = counts[f.key] ?? 0;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-none-full "
                    style={{
                      background: isActive
                        ? 'var(--color-primary)'
                        : 'var(--color-muted)',
                      color: isActive ? 'white' : 'var(--color-muted-fg)',
                      border: isActive
                        ? '1px solid transparent'
                        : '1px solid var(--color-border)',
                      fontFamily: 'Plus Jakarta Sans, sans-serif',
                    }}
                  >
                    {f.label}
                    <span
                      className="text-[10.5px] px-1.5 py-0.2 rounded-none-full font-bold"
                      style={{
                        background: isActive
                          ? 'rgba(255,255,255,0.2)'
                          : 'var(--color-border)',
                        color: isActive ? 'white' : 'var(--color-muted-fg)',
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Campaign List */}
          {filtered.length === 0 ? (
            <div
              className="rounded-none-none p-10 text-center bg-slate-50"
              style={{ border: '1px solid var(--color-border)' }}
            >
              <p
                className="text-[13.5px]"
                style={{
                  color: 'var(--color-muted-fg)',
                  fontFamily: 'sans-serif',
                }}
              >
                No campaigns match your search or filter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((campaign) => {
                const statusCfg =
                  STATUS_CFG[campaign.status] ?? STATUS_CFG.DRAFT;
                const createdDate = new Date(
                  campaign.createdAt,
                ).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

                return (
                  <div
                    key={campaign.id}
                    className="bg-slate-50 rounded-none-none p-5 border border-slate-200 hover:border-indigo-300 hover:-xs  flex flex-col justify-between"
                  >
                    <div>
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <h3
                          className="text-[15px] font-bold text-slate-900 truncate"
                          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                        >
                          {campaign.name}
                        </h3>
                        <span
                          className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-none-full"
                          style={{
                            background: statusCfg.bg,
                            color: statusCfg.color,
                            border: `1px solid ${statusCfg.border}`,
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-none-full"
                            style={{ background: statusCfg.dot }}
                          />
                          {statusCfg.label}
                        </span>
                      </div>

                      {/* Sender Info */}
                      {campaign.senders?.[0]?.fromEmail ? (
                        <p className="text-[12px] text-slate-500 font-mono truncate flex items-center gap-1.5 mb-2">
                          <HugeiconsIcon icon={MailIcon} size={13} className="shrink-0 text-slate-400" />
                          <span className="truncate">
                            {campaign.senders[0].fromEmail}
                          </span>
                        </p>
                      ) : (
                        <p className="text-[12px] text-slate-400 italic mb-2">
                          No sender configured
                        </p>
                      )}

                      {/* Follow-up info */}
                      {campaign.followUpDelayBusinessDays > 0 && (
                        <p
                          className="text-[11.5px] text-slate-500 mb-1"
                          style={{ fontFamily: 'sans-serif' }}
                        >
                          Follow-up delay: {campaign.followUpDelayBusinessDays}{' '}
                          business days
                        </p>
                      )}

                      <p
                        className="text-[11.5px] text-slate-400"
                        style={{ fontFamily: 'sans-serif' }}
                      >
                        Created {createdDate}
                      </p>
                    </div>

                    {/* Action link */}
                    <div className="border-t border-slate-100 pt-3 mt-4 flex items-center justify-end">
                      <Link
                        to="/campaigns/$campaignId/review"
                        params={{ campaignId: campaign.id }}
                        className="inline-flex items-center gap-1 text-[13px] font-semibold text-indigo-600 hover:text-indigo-800 "
                        style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                      >
                        Review Outreaches <HugeiconsIcon icon={ArrowRightIcon} size={13} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
