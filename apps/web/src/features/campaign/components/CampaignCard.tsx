import type { CampaignDto, CampaignStatus } from '../../../api/campaigns';
import type { CompanyDto } from '../../../api/companies';
import { computeCampaignReadiness } from '../../../domain/campaign-readiness';

const STATUS_CFG: Record<CampaignStatus, { color: string; bg: string; border: string; dot: string }> = {
  DRAFT: { color: '#374151', bg: '#F3F4F6', border: '#E5E7EB', dot: '#9CA3AF' },
  SCHEDULED: { color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD', dot: '#38BDF8' },
  ACTIVE: { color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0', dot: '#10B981' },
  PAUSED: { color: '#92400E', bg: '#FFF7ED', border: '#FED7AA', dot: '#F97316' },
  COMPLETED: { color: '#374151', bg: '#F3F4F6', border: '#E5E7EB', dot: '#6B7280' },
  ARCHIVED: { color: '#6B7280', bg: '#F9FAFB', border: '#F3F4F6', dot: '#D1D5DB' },
};

const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export function CampaignCard({
  campaign,
  company,
  onClick,
  onPause,
  onResume,
}: {
  campaign: CampaignDto;
  company?: CompanyDto;
  onClick: () => void;
  onPause?: () => void;
  onResume?: () => void;
}) {
  const cfg = STATUS_CFG[campaign.status] || STATUS_CFG['DRAFT'];
  const readiness = computeCampaignReadiness(campaign.status, campaign.senders);

  return (
    <div
      role="article"
      className="rounded-xl p-5 cursor-pointer transition-all"
      style={{ background: 'var(--color-card, #ffffff)', border: '1px solid var(--color-border, #E5E7EB)' }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-accent, #4F46E5)';
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(79,70,229,0.07)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border, #E5E7EB)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3
            className="text-[15px] font-bold truncate"
            style={{ color: 'var(--color-primary, #111827)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
          >
            {campaign.name}
          </h3>
          <p
            className="text-[12px] mt-0.5 truncate"
            style={{ color: 'var(--color-muted-fg, #6B7280)', fontFamily: '"Inter", sans-serif' }}
          >
            Target: {company?.name || 'Unknown'}
          </p>
        </div>
        <span
          className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={{
            background: cfg.bg,
            color: cfg.color,
            border: `1px solid ${cfg.border}`,
            fontFamily: '"Plus Jakarta Sans", sans-serif',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
          {CAMPAIGN_STATUS_LABELS[campaign.status]}
        </span>
      </div>

      <div className="flex flex-col gap-2 mb-3">
        {campaign.sendingIdentity && (
          <div className="text-[12px] font-mono" style={{ color: 'var(--color-muted-fg, #6B7280)' }}>
            Identity: {campaign.sendingIdentity}
          </div>
        )}
        <div>
          {readiness.state === 'READY' && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
              style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0' }}
            >
              {readiness.eligibleSenderCount} Sender{readiness.eligibleSenderCount > 1 ? 's' : ''} Ready
            </span>
          )}
          {readiness.state === 'NEEDS_SENDER' && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
              style={{ background: '#FFF7ED', color: '#9A3412', border: '1px solid #FFEDD5' }}
            >
              Needs Sender
            </span>
          )}
          {(readiness.state === 'ALL_SENDERS_INELIGIBLE' || readiness.state === 'READINESS_UNKNOWN') && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
              style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FEE2E2' }}
            >
              Sender Issues
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border, #E5E7EB)' }}>
        <span
          className="text-[12px]"
          style={{ color: 'var(--color-muted-fg, #6B7280)', fontFamily: '"Inter", sans-serif' }}
        >
          {new Date(campaign.updatedAt).toLocaleDateString()}
        </span>
        <div className="flex items-center gap-3">
          {campaign.status === 'ACTIVE' && onPause && (
            <button
              aria-label="Pause campaign"
              onClick={(e) => { e.stopPropagation(); onPause(); }}
              className="text-[12px] font-semibold transition-opacity hover:opacity-80"
              style={{ color: '#D97706', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            >
              Pause
            </button>
          )}
          {campaign.status === 'PAUSED' && onResume && (
            <button
              aria-label="Resume campaign"
              onClick={(e) => { e.stopPropagation(); onResume(); }}
              className="text-[12px] font-semibold transition-opacity hover:opacity-80"
              style={{ color: '#059669', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            >
              Resume
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
