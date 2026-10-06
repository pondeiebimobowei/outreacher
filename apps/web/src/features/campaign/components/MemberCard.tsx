import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRightIcon } from '@hugeicons/core-free-icons';
import type { CampaignRecipientStatus } from '../../../api/campaigns';
import type { CampaignRecipientSummaryDto } from '../../../api/outreach';

const MEMBER_STATUS_CFG: Record<CampaignRecipientStatus, { color: string; bg: string; border: string; dot: string }> = {
  PENDING: { color: '#374151', bg: '#F3F4F6', border: '#E5E7EB', dot: '#9CA3AF' },
  ACTIVE: { color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE', dot: '#3B82F6' },
  PAUSED: { color: '#92400E', bg: '#FFF7ED', border: '#FED7AA', dot: '#F97316' },
  COMPLETED: { color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0', dot: '#10B981' },
  SUPPRESSED: { color: '#991B1B', bg: '#FEF2F2', border: '#FECACA', dot: '#EF4444' },
  FAILED: { color: '#991B1B', bg: '#FEF2F2', border: '#FECACA', dot: '#EF4444' },
  REMOVED: { color: '#6B7280', bg: '#F9FAFB', border: '#F3F4F6', dot: '#D1D5DB' },
};

const MEMBER_STATUS_LABELS: Record<CampaignRecipientStatus, string> = {
  PENDING: 'Needs Review',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  SUPPRESSED: 'Blocked',
  FAILED: 'Failed',
  REMOVED: 'Removed',
};

const MONOGRAM_COLORS: Record<string, { bg: string; text: string }> = {
  default: { bg: '#F3F4F6', text: '#374151' },
};

export function getNextAction(status: CampaignRecipientStatus): string {
  switch (status) {
    case 'ACTIVE': return 'Awaiting reply';
    case 'PENDING': return 'Prepare message';
    case 'PAUSED': return 'Review paused';
    case 'SUPPRESSED':
    case 'FAILED': return 'View history';
    case 'COMPLETED': return 'View outcome';
    default: return 'Review status';
  }
}

export function MemberCard({
  member,
  companyName,
  onOpenRecipient,
}: {
  member: CampaignRecipientSummaryDto;
  companyName: string;
  onOpenRecipient: () => void;
}) {
  const cfg = MEMBER_STATUS_CFG[member.status] || MEMBER_STATUS_CFG['PENDING'];
  const nextAction = getNextAction(member.status);
  const isActionable = member.status !== 'COMPLETED';
  const name = member.person.firstName || 'Unknown';
  const initial = name[0] ? name[0].toUpperCase() : '?';
  const subject = member.outreach?.subject || (member as any).currentSubject;

  return (
    <div
      className="rounded-none-none p-4 "
      style={{ background: 'var(--color-card, #ffffff)', border: '1px solid var(--color-border, #E5E7EB)' }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-none-none flex items-center justify-center font-bold text-[13px] shrink-0"
            style={{
              background: MONOGRAM_COLORS['default'].bg,
              color: MONOGRAM_COLORS['default'].text,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
            }}
          >
            {initial}
          </div>
          <div>
            <p
              className="text-[14px] font-semibold leading-snug"
              style={{ color: 'var(--color-primary, #111827)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            >
              {name}
            </p>
            <p
              className="text-[12px] font-medium"
              style={{ color: 'var(--color-muted-fg, #6B7280)', fontFamily: 'sans-serif' }}
            >
              {companyName}
            </p>
          </div>
        </div>
        <span
          className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-none-full"
          style={{
            background: cfg.bg,
            color: cfg.color,
            border: `1px solid ${cfg.border}`,
            fontFamily: '"Plus Jakarta Sans", sans-serif',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-none-full" style={{ background: cfg.dot }} />
          {MEMBER_STATUS_LABELS[member.status] || member.status}
        </span>
      </div>

      {subject && (
        <div
          className="rounded-none-none px-3 py-2 mb-3"
          style={{ background: 'var(--color-muted, #F3F4F6)', border: '1px solid var(--color-border, #E5E7EB)' }}
        >
          <p
            className="text-[11px] font-semibold mb-0.5"
            style={{ color: 'var(--color-muted-fg, #6B7280)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
          >
            Subject
          </p>
          <p
            className="text-[12.5px] truncate"
            style={{ color: 'var(--color-primary, #111827)', fontFamily: 'sans-serif' }}
          >
            {subject}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span
          className="text-[12px]"
          style={{ color: 'var(--color-muted-fg, #6B7280)', fontFamily: 'sans-serif' }}
        >
          {new Date(member.updatedAt).toLocaleDateString()}
        </span>
        {isActionable ? (
          <button
            onClick={onOpenRecipient}
            className="text-[12px] font-semibold flex items-center gap-1 hover:opacity-80 -opacity cursor-pointer"
            style={{ color: 'var(--color-accent, #4F46E5)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
          >
            {nextAction} <HugeiconsIcon icon={ArrowRightIcon} size={11} />
          </button>
        ) : (
          <span
            className="text-[12px]"
            style={{ color: 'var(--color-muted-fg, #6B7280)', fontFamily: 'sans-serif' }}
          >
            {nextAction}
          </span>
        )}
      </div>
    </div>
  );
}
