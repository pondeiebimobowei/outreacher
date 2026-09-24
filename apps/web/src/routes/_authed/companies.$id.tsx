import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { fetchCompanyById } from '../../api/companies';
import { fetchCompanyResearch } from '../../api/research';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeftIcon, ExternalLinkIcon, MapPinIcon, Building02Icon, ArrowRightIcon } from '@hugeicons/core-free-icons';;
import { OverviewTab } from '../../features/company/components/OverviewTab';
import { ResearchTab } from '../../features/company/components/ResearchTab';
import { OpportunitiesTab } from '../../features/company/components/OpportunitiesTab';
import { ContactsTab } from '../../features/company/components/ContactsTab';
import { OutreachTab } from '../../features/company/components/OutreachTab';
import { CampaignTab } from '../../features/company/components/CampaignTab';
import { ConversationTab } from '../../features/company/components/ConversationTab';

type WorkspaceTab = 'Overview' | 'Research' | 'Opportunities' | 'Contacts' | 'Outreach' | 'Campaign' | 'Conversation';
const WORKSPACE_TABS: WorkspaceTab[] = ['Overview', 'Research', 'Opportunities', 'Contacts', 'Outreach', 'Campaign', 'Conversation'];

const MONOGRAM_COLORS = [
  { bg: '#EEF2FF', text: '#4F46E5' },
  { bg: '#FDF4FF', text: '#9333EA' },
  { bg: '#ECFDF5', text: '#059669' },
  { bg: '#FFF7ED', text: '#D97706' },
  { bg: '#EFF6FF', text: '#1D4ED8' },
  { bg: '#FEF2F2', text: '#DC2626' },
  { bg: '#F0FDF4', text: '#16A34A' },
];

function getMonogramColor(name: string) {
  if (!name) return MONOGRAM_COLORS[0];
  return MONOGRAM_COLORS[name.charCodeAt(0) % MONOGRAM_COLORS.length];
}

const OPP_STATUS_CFG = {
  CONFIRMED: { bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0', dot: '#10B981', label: 'CONFIRMED' },
  PROACTIVE: { bg: '#EEF2FF', color: '#3730A3', border: '#C7D2FE', dot: '#4F46E5', label: 'PROACTIVE' },
  UNCLASSIFIED: { bg: '#FEFCE8', color: '#713F12', border: '#FDE68A', dot: '#F59E0B', label: 'UNCLASSIFIED' },
};

function derivePrimaryAction(researchStatus: string | null | undefined): { label: string; tab: WorkspaceTab } {
  if (!researchStatus || researchStatus === 'NOT_STARTED' || researchStatus === 'FAILED') {
    return { label: 'Start research →', tab: 'Research' };
  }
  if (researchStatus === 'QUEUED' || researchStatus === 'RUNNING') {
    return { label: 'Research running…', tab: 'Research' };
  }
  // COMPLETED or PARTIAL
  return { label: 'Find contacts →', tab: 'Contacts' };
}

export const Route = createFileRoute('/_authed/companies/$id')({
  component: CompanyDetailRouteComponent,
});

function CompanyDetailRouteComponent() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('Overview');

  const { data: company, isLoading: isLoadingCompany, isError: isErrorCompany } = useQuery({
    queryKey: ['company', id],
    queryFn: () => fetchCompanyById(id),
  });

  const { data: research } = useQuery({
    queryKey: ['company-research', id],
    queryFn: () => fetchCompanyResearch(id),
  });

  if (isLoadingCompany) {
    return (
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        <div className="bg-slate-50 rounded-none-none border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center gap-2 text-[13.5px] text-slate-500">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Loading workspace...
          </div>
        </div>
      </div>
    );
  }

  if (isErrorCompany || !company) {
    return (
      <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
        <button
          onClick={() => navigate({ to: '/companies' })}
          className="flex items-center gap-1.5 text-[13px] font-medium mb-5 "
          style={{ color: 'var(--color-muted-fg)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted-fg)')}
        >
          <HugeiconsIcon icon={ArrowLeftIcon} size={14} /> Companies
        </button>
        <div className="flex flex-col items-center gap-4 py-16">
          <p className="text-[16px] font-bold" style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Company not found
          </p>
          <p className="text-[13.5px]" style={{ color: 'var(--color-muted-fg)' }}>
            This company doesn't exist in your workspace.
          </p>
        </div>
      </div>
    );
  }

  const monoColors = getMonogramColor(company.name);
  const isArchived = company.status === 'ARCHIVED';
  const latestOpp = research?.opportunities?.[0];
  const oppStatus: keyof typeof OPP_STATUS_CFG = latestOpp ? 'CONFIRMED' : research?.status === 'COMPLETED' || research?.status === 'PARTIAL' ? 'PROACTIVE' : 'UNCLASSIFIED';
  const oppCfg = OPP_STATUS_CFG[oppStatus];
  const primaryAction = derivePrimaryAction(research?.status);
  const researchComplete = research?.status === 'COMPLETED' || research?.status === 'PARTIAL';

  return (
    <div className="max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate({ to: '/companies' })}
        className="flex items-center gap-1.5 text-[13px] font-medium mb-5 "
        style={{ color: 'var(--color-muted-fg)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted-fg)')}
      >
        <HugeiconsIcon icon={ArrowLeftIcon} size={14} /> Companies
      </button>

      {/* Workspace header */}
      <div className="rounded-none-none p-5 mb-4" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* Monogram — uses the same color logic as the list */}
            <div
              className="w-12 h-12 rounded-none-none flex items-center justify-center font-bold text-[18px] shrink-0"
              style={{
                background: isArchived ? 'var(--color-muted)' : monoColors.bg,
                color: isArchived ? 'var(--color-muted-fg)' : monoColors.text,
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}
            >
              {company.name[0]?.toUpperCase()}
            </div>

            {/* Identity block */}
            <div>
              {/* Name + opportunity badge row */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1
                  className="text-[20px] font-bold tracking-tight"
                  style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  {company.name}
                </h1>
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-none-full"
                  style={{
                    background: oppCfg.bg,
                    color: oppCfg.color,
                    border: `1px solid ${oppCfg.border}`,
                    fontFamily: 'Plus Jakarta Sans, sans-serif',
                    letterSpacing: '0.04em',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-none-full" style={{ background: oppCfg.dot }} />
                  {oppCfg.label}
                </span>
                {isArchived && (
                  <span
                    className="text-[10.5px] font-semibold px-2 py-0.5 rounded-none"
                    style={{ background: 'var(--color-muted)', color: 'var(--color-muted-fg)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                  >
                    Archived
                  </span>
                )}
              </div>

              {/* Domain */}
              {company.domain && (
                <a
                  href={`https://${company.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12.5px] flex items-center gap-1 mt-1 "
                  style={{ color: 'var(--color-muted-fg)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted-fg)')}
                >
                  {company.domain} <HugeiconsIcon icon={ExternalLinkIcon} size={11} />
                </a>
              )}

              {/* Industry + Location */}
              {(company.industry || company.location) && (
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {company.industry && (
                    <span className="flex items-center gap-1 text-[12px]" style={{ color: 'var(--color-muted-fg)', fontFamily: 'sans-serif' }}>
                      <HugeiconsIcon icon={Building02Icon} size={11} />
                      {company.industry}
                    </span>
                  )}
                  {company.location && (
                    <span className="flex items-center gap-1 text-[12px]" style={{ color: 'var(--color-muted-fg)', fontFamily: 'sans-serif' }}>
                      <HugeiconsIcon icon={MapPinIcon} size={11} />
                      {company.location}
                    </span>
                  )}
                </div>
              )}

              {/* Description */}
              {company.description && (
                <p
                  className="text-[12.5px] mt-2 max-w-[480px] leading-relaxed"
                  style={{ color: 'var(--color-muted-fg)', fontFamily: 'sans-serif' }}
                >
                  {company.description}
                </p>
              )}
            </div>
          </div>

          {/* Primary CTA */}
          <div className="shrink-0">
            <button
              onClick={() => setActiveTab(primaryAction.tab)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-none-none text-[13.5px] font-semibold  whitespace-nowrap"
              style={{ background: 'var(--color-primary)', color: 'white', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#1E2D4A')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-primary)')}
            >
              {primaryAction.label} <HugeiconsIcon icon={ArrowRightIcon} size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Tab nav — pill-shaped bar matching prototype exactly */}
      <div
        className="flex items-center gap-0.5 mb-5 p-1 overflow-x-auto"
        style={{ background: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 12 }}
      >
        {WORKSPACE_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="shrink-0 sm:flex-1 px-4 sm:px-3 py-2 rounded-none-none text-[13.5px] font-medium  whitespace-nowrap"
            style={{
              background: activeTab === tab ? 'var(--color-card)' : 'transparent',
              color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-muted-fg)',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.07)' : 'none',
            }}
            onMouseEnter={e => { if (activeTab !== tab) e.currentTarget.style.color = 'var(--color-primary)'; }}
            onMouseLeave={e => { if (activeTab !== tab) e.currentTarget.style.color = 'var(--color-muted-fg)'; }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'Overview' && <OverviewTab company={company} research={research} onTabChange={(t) => setActiveTab(t as WorkspaceTab)} />}
        {activeTab === 'Research' && <ResearchTab company={company} research={research} />}
        {activeTab === 'Opportunities' && <OpportunitiesTab company={company} research={research} />}
        {activeTab === 'Contacts' && <ContactsTab company={company} />}
        {activeTab === 'Outreach' && <OutreachTab company={company} researchComplete={researchComplete} />}
        {activeTab === 'Campaign' && <CampaignTab company={company} researchComplete={researchComplete} />}
        {activeTab === 'Conversation' && <ConversationTab company={company} />}
      </div>
    </div>
  );
}
