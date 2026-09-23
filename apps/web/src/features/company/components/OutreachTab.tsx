import { useQuery } from '@tanstack/react-query';
import { CompanyDto } from '../../../api/companies';
import { resolveCanonicalCompanyCampaign } from '../../../api/campaigns';
import { fetchCampaignContacts, CampaignContactSummaryDto } from '../../../api/outreach';
import { GateCard } from './GateCard';
import { Send, Search, ChevronRight } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

function statusBadge(status: string) {
  const cfg: Record<string, { bg: string; color: string; border: string; dot: string }> = {
    SENT: { bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0', dot: '#10B981' },
    READY: { bg: '#EEF2FF', color: '#3730A3', border: '#C7D2FE', dot: '#4F46E5' },
    DRAFT: { bg: '#F3F4F6', color: '#374151', border: '#D1D5DB', dot: '#6B7280' },
    PENDING: { bg: '#FFFBEB', color: '#78350F', border: '#FDE68A', dot: '#F59E0B' },
  };
  const s = cfg[status] ?? cfg.DRAFT;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.04em' }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.dot }} />
      {status}
    </span>
  );
}

export function OutreachTab({
  company,
  researchComplete,
}: {
  company: CompanyDto;
  researchComplete: boolean;
}) {
  const navigate = useNavigate();

  const { data: campaign } = useQuery({
    queryKey: ['canonical-campaign', company.id],
    queryFn: () => resolveCanonicalCompanyCampaign(company.id, company.name),
    enabled: researchComplete,
  });

  const { data: campaignContacts, isLoading } = useQuery({
    queryKey: ['campaign-contacts', campaign?.id],
    queryFn: () => fetchCampaignContacts(campaign!.id),
    enabled: !!campaign?.id,
  });

  if (!researchComplete) {
    return (
      <GateCard
        icon={Search}
        heading="Complete research first"
        body="Complete company research before preparing outreach. Research provides the evidence that makes outreach credible."
      />
    );
  }

  if (isLoading || (campaign && campaignContacts === undefined)) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <div className="inline-flex items-center gap-2 text-[13.5px] text-slate-500">
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          Loading outreach data...
        </div>
      </div>
    );
  }

  const contacts: CampaignContactSummaryDto[] = campaignContacts ?? [];

  if (contacts.length === 0) {
    return (
      <GateCard
        icon={Send}
        heading="No contacts in outreach yet"
        body="Discover and select contacts in the Contacts tab. Once a contact is selected, Outreacher will prepare a personalised email for review."
      />
    );
  }

  return (
    <div className="space-y-3">
      {campaign && (
        <div className="px-1 pb-2 flex items-center justify-between">
          <p className="text-[13px] font-medium" style={{ color: 'var(--color-muted-fg)' }}>
            {contacts.length} contact{contacts.length !== 1 ? 's' : ''} in this campaign
          </p>
          <button
            onClick={() =>
              navigate({ to: '/campaigns/$campaignId/review', params: { campaignId: campaign.id } })
            }
            className="flex items-center gap-1 text-[13px] font-semibold transition-colors"
            style={{ color: 'var(--color-accent)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#4338CA')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-accent)')}
          >
            Open campaign review <ChevronRight size={14} />
          </button>
        </div>
      )}

      {contacts.map((c: CampaignContactSummaryDto) => {
        // c.contact is embedded — use it directly for real identity
        const personName = c.contact.name;
        const personTitle = c.contact.title ?? c.targetRole ?? null;
        const personEmail = c.contact.email;
        const hasSubject = !!c.currentSubject;

        return (
          <div
            key={c.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
          >
            {/* Contact identity row */}
            <div className="flex items-start justify-between gap-4 p-5">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-[14px] shrink-0"
                  style={{
                    background: '#EEF2FF',
                    color: '#4F46E5',
                    fontFamily: 'Plus Jakarta Sans, sans-serif',
                  }}
                >
                  {personName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p
                    className="text-[14px] font-semibold truncate"
                    style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                  >
                    {personName}
                  </p>
                  {personTitle && (
                    <p
                      className="text-[12.5px] truncate mt-0.5"
                      style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}
                    >
                      {personTitle}
                    </p>
                  )}
                  {personEmail && (
                    <p
                      className="text-[12px] truncate mt-0.5 font-mono"
                      style={{ color: 'var(--color-muted-fg)' }}
                    >
                      {personEmail}
                    </p>
                  )}
                </div>
              </div>
              <div className="shrink-0 pt-0.5">{statusBadge(c.status)}</div>
            </div>

            {/* Draft subject preview if available */}
            {hasSubject && (
              <div
                className="px-5 pb-4 border-t"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <p
                  className="text-[11px] font-bold uppercase tracking-wide mt-3 mb-1"
                  style={{ color: 'var(--color-muted-fg)', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.07em' }}
                >
                  Draft subject
                </p>
                <p
                  className="text-[13px] truncate"
                  style={{ color: 'var(--color-primary)', fontFamily: 'Inter, sans-serif' }}
                >
                  {c.currentSubject}
                </p>
              </div>
            )}

            {/* Action row */}
            {campaign && (
              <div
                className="px-5 py-3 flex items-center justify-end border-t"
                style={{ background: 'var(--color-muted)', borderColor: 'var(--color-border)' }}
              >
                <button
                  onClick={() =>
                    navigate({
                      to: '/campaigns/$campaignId/review',
                      params: { campaignId: campaign.id },
                    })
                  }
                  className="flex items-center gap-1.5 text-[13px] font-semibold transition-colors"
                  style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-primary)')}
                >
                  Review outreach <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
