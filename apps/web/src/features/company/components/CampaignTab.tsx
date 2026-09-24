import { useQuery } from '@tanstack/react-query';
import { CompanyDto } from '../../../api/companies';
import { resolveCanonicalCompanyCampaign, CampaignDto } from '../../../api/campaigns';
import { GateCard } from './GateCard';
import { Megaphone, Search, ChevronRight, ArrowRight } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

function campaignStatusBadge(status: string) {
  const cfg: Record<string, { bg: string; color: string; border: string; dot: string }> = {
    ACTIVE: { bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0', dot: '#10B981' },
    DRAFT: { bg: '#FFFBEB', color: '#78350F', border: '#FDE68A', dot: '#F59E0B' },
    PAUSED: { bg: '#F3F4F6', color: '#374151', border: '#D1D5DB', dot: '#6B7280' },
    COMPLETED: { bg: '#EEF2FF', color: '#3730A3', border: '#C7D2FE', dot: '#4F46E5' },
  };
  const s = cfg[status] ?? cfg.DRAFT;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        letterSpacing: '0.04em',
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {status}
    </span>
  );
}

function CampaignCard({ campaign, navigate }: { campaign: CampaignDto; navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: '#EEF2FF', color: '#4F46E5' }}
          >
            <Megaphone size={18} />
          </div>
          <div className="min-w-0">
            <p
              className="text-[15px] font-bold truncate"
              style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {campaign.name}
            </p>
            {campaign.sendingIdentity && (
              <p
                className="text-[12.5px] mt-0.5 truncate"
                style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}
              >
                Sender: {campaign.sendingIdentity}
              </p>
            )}
            <p
              className="text-[12px] mt-0.5"
              style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}
            >
              Created {new Date(campaign.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="shrink-0">{campaignStatusBadge(campaign.status)}</div>
      </div>

      {/* Stats row */}
      {campaign.followUpDelayBusinessDays != null && (
        <div
          className="px-5 py-3 flex items-center gap-4 border-t text-[12.5px]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}
        >
          <span>Follow-up delay: {campaign.followUpDelayBusinessDays} business day{campaign.followUpDelayBusinessDays !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Action row */}
      <div
        className="px-5 py-3 flex items-center justify-between border-t"
        style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)' }}
      >
        <span
          className="text-[12px]"
          style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}
        >
          Review contacts and outreach in this campaign
        </span>
        <button
          onClick={() =>
            navigate({ to: '/campaigns/$campaignId/review', params: { campaignId: campaign.id } })
          }
          className="flex items-center gap-1.5 text-[13px] font-semibold transition-colors"
          style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-primary)')}
        >
          Open review <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

export function CampaignTab({
  company,
  researchComplete,
}: {
  company: CompanyDto;
  researchComplete: boolean;
}) {
  const navigate = useNavigate();

  const {
    data: campaign,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['canonical-campaign', company.id],
    queryFn: () => resolveCanonicalCompanyCampaign(company.id, company.name),
    enabled: researchComplete,
  });

  if (!researchComplete) {
    return (
      <GateCard
        icon={Search}
        heading="Complete research first"
        body="Complete company research before creating a campaign. Research provides the foundation for credible, evidence-backed outreach."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <div className="inline-flex items-center gap-2 text-[13.5px] text-slate-500">
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          Loading campaign...
        </div>
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <GateCard
        icon={Megaphone}
        heading="No campaign found"
        body="No campaign has been created for this company yet. Complete research and contacts to begin."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="px-1 pb-1 flex items-center justify-between">
        <p className="text-[13.5px] font-semibold" style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Company campaign
        </p>
        <button
          onClick={() => navigate({ to: '/campaigns' })}
          className="flex items-center gap-1 text-[13px]"
          style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted-fg)')}
        >
          All campaigns <ChevronRight size={13} />
        </button>
      </div>
      <CampaignCard campaign={campaign} navigate={navigate} />
    </div>
  );
}
