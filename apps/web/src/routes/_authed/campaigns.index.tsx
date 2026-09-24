import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { CampaignDto, CampaignStatus, fetchCampaigns, pauseCampaign, resumeCampaign } from '../../api/campaigns';
import { CompanyDto, fetchCompanies } from '../../api/companies';
import { ErrorState, LoadingState } from '../../components/states';
import { CampaignCard } from '../../features/campaign/components/CampaignCard';
import { CreateCampaignModal } from '../../features/campaign/components/CreateCampaignModal';

export const Route = createFileRoute('/_authed/campaigns/')({
  component: CampaignsIndexComponent,
});

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

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-24 px-8">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--color-muted, #F3F4F6)', color: 'var(--color-muted-fg, #6B7280)' }}>
        <Megaphone size={26} strokeWidth={1.5} />
      </div>
      <div className="text-center max-w-100">
        <h2 className="text-[20px] font-bold mb-2" style={{ color: 'var(--color-primary, #111827)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
          No campaigns yet
        </h2>
        <p className="text-[14px] leading-relaxed" style={{ color: 'var(--color-muted-fg, #6B7280)', fontFamily: '"Inter", sans-serif' }}>
          Create a campaign when you're ready to reach multiple people with a reusable outreach message.
        </p>
      </div>
      <button
        onClick={onCreate}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13.5px] font-semibold transition-all"
        style={{ background: 'var(--color-primary, #111827)', color: 'white', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#1E2D4A')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-primary, #111827)')}
      >
        <Plus size={15} /> Create campaign
      </button>
    </div>
  );
}

function CampaignsIndexComponent() {
  const queryClient = useQueryClient();

  const pauseMutation = useMutation({
    mutationFn: pauseCampaign,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const resumeMutation = useMutation({
    mutationFn: resumeCampaign,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<'ALL' | CampaignStatus>('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const {
    data: campaigns,
    isLoading: isLoadingCampaigns,
    isError: isErrorCampaigns,
    error: errorCampaigns,
    refetch: refetchCampaigns,
  } = useQuery<CampaignDto[]>({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
  });

  const { data: companies } = useQuery<CompanyDto[]>({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  });

  const isLoading = isLoadingCampaigns;
  const isError = isErrorCampaigns;
  const error = errorCampaigns;

  const filteredCampaigns = (campaigns ?? []).filter((camp) => {
    return statusFilter === 'ALL' ? true : camp.status === statusFilter;
  });

  if (isLoading) {
    return <LoadingState message="Loading campaign catalog..." />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to Load Campaigns"
        message={error instanceof Error ? error.message : 'An unexpected error occurred while loading campaigns.'}
        onRetry={() => refetchCampaigns()}
      />
    );
  }

  const allStatuses: ('ALL' | CampaignStatus)[] = ['ALL', 'ACTIVE', 'PAUSED', 'DRAFT', 'SCHEDULED', 'COMPLETED', 'ARCHIVED'];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: 'var(--color-primary, #111827)', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            Campaigns
          </h1>
          <p className="text-[14px] mt-1" style={{ color: 'var(--color-muted-fg, #6B7280)', fontFamily: '"Inter", sans-serif' }}>
            Workspace directory of all outreach initiatives, active queues, and historical campaigns.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate({ to: '/companies' })}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold transition-all border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
          >
            Target Companies
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all shadow-xs"
            style={{ background: 'var(--color-primary, #111827)', color: 'white', fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1E2D4A')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-primary, #111827)')}
          >
            <Plus size={14} /> Create campaign
          </button>
        </div>
      </div>

      {(campaigns ?? []).length === 0 ? (
        <EmptyState onCreate={() => setIsCreateModalOpen(true)} />
      ) : (
        <>
          {/* Status filter bar */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {allStatuses.filter(s => s !== 'ALL').map((s) => {
              const st = s as CampaignStatus;
              const count = (campaigns ?? []).filter((c) => c.status === st).length;
              if (count === 0) return null;
              const cfg = STATUS_CFG[st];
              const isSelected = statusFilter === st || statusFilter === 'ALL';
              return (
                <button
                  key={st}
                  onClick={() => setStatusFilter(statusFilter === st ? 'ALL' : st)}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-full transition-all cursor-pointer hover:opacity-80"
                  style={{
                    background: isSelected ? cfg.bg : '#ffffff',
                    color: isSelected ? cfg.color : '#6B7280',
                    border: `1px solid ${isSelected ? cfg.border : '#E5E7EB'}`,
                    opacity: isSelected ? 1 : 0.6
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
                  {CAMPAIGN_STATUS_LABELS[st]} · {count}
                </button>
              );
            })}
          </div>

          {/* Campaign grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCampaigns.map((c) => (
              <CampaignCard
                key={c.id}
                campaign={c}
                company={companies?.find((comp) => comp.id === c.companyId)}
                onClick={() => navigate({ to: '/campaigns/$campaignId/review', params: { campaignId: c.id } })}
                onPause={() => pauseMutation.mutate(c.id)}
                onResume={() => resumeMutation.mutate(c.id)}
              />
            ))}
          </div>
        </>
      )}

      <CreateCampaignModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        companies={companies ?? []}
      />
    </div>
  );
}
