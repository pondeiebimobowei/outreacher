import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { CampaignDto, CampaignStatus, fetchCampaigns, pauseCampaign, resumeCampaign } from '../../api/campaigns';
import { CompanyDto, fetchCompanies } from '../../api/companies';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { computeCampaignReadiness } from '../../domain/campaign-readiness';

export const Route = createFileRoute('/_authed/campaigns/')({
  component: CampaignsIndexComponent,
});

function getStatusConfig(status: CampaignStatus | 'SCHEDULED' | 'COMPLETED' | string) {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Active', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'PAUSED':
      return { label: 'Paused', classes: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'DRAFT':
      return { label: 'In Preparation', classes: 'bg-slate-50 text-slate-700 border-slate-200' };
    case 'SCHEDULED':
      return { label: 'Scheduled', classes: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'COMPLETED':
      return { label: 'Completed', classes: 'bg-slate-100 text-slate-800 border-slate-300' };
    case 'ARCHIVED':
      return { label: 'Archived', classes: 'bg-slate-100 text-slate-500 border-slate-200 opacity-80' };
    default:
      return { label: status, classes: 'bg-slate-50 text-slate-700 border-slate-200' };
  }
}

function getActionLabel(status: string) {
  switch (status) {
    case 'DRAFT':
      return 'Review Drafts';
    case 'ACTIVE':
    case 'PAUSED':
      return 'Review Queue';
    case 'SCHEDULED':
      return 'View Schedule';
    case 'COMPLETED':
      return 'View Outcomes';
    case 'ARCHIVED':
      return 'View History';
    default:
      return 'Open Hub';
  }
}

function CampaignsIndexComponent() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<'ALL' | CampaignStatus | 'SCHEDULED' | 'COMPLETED' | 'ARCHIVED'>('ALL');

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

  const {
    data: companies,
  } = useQuery<CompanyDto[]>({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  });

  const pauseMutation = useMutation({
    mutationFn: pauseCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: resumeCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
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
        message={
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while loading campaigns.'
        }
        onRetry={() => refetchCampaigns()}
      />
    );
  }

  const hasCampaigns = (campaigns ?? []).length > 0;
  const allStatuses = ['ALL', 'ACTIVE', 'PAUSED', 'DRAFT', 'SCHEDULED', 'COMPLETED', 'ARCHIVED'] as const;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-600">
            Workspace directory of all outreach initiatives, active queues, and historical campaigns.
          </p>
        </div>
      </div>

      {/* List Toolbar (Filter) */}
      {hasCampaigns && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider shrink-0">
              Filter:
            </span>
            <div className="inline-flex rounded-md shadow-sm border border-slate-300 bg-white p-0.5 shrink-0">
              {allStatuses.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {st === 'ALL' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {!hasCampaigns ? (
        <EmptyState
          title="No Campaigns Found"
          description="Campaigns are created automatically when you establish an outreach initiative from a target company workspace."
          actionLabel="View Target Companies"
          onAction={() => navigate({ to: '/companies' })}
        />
      ) : filteredCampaigns.length === 0 ? (
        <div className="py-12 text-center bg-white rounded-lg border border-slate-200">
          <p className="text-sm font-medium text-slate-900">No campaigns match this filter.</p>
          <p className="mt-1 text-xs text-slate-500">Try selecting a different status.</p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-900 uppercase tracking-wider">
                    Campaign
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-900 uppercase tracking-wider">
                    Target Company
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-900 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-900 uppercase tracking-wider">
                    Last Updated
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-900 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredCampaigns.map((campaign) => {
                  const company = companies?.find((c) => c.id === campaign.companyId);
                  const statusConf = getStatusConfig(campaign.status);
                  
                  return (
                    <tr key={campaign.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-slate-900">{campaign.name}</div>
                        {campaign.sendingIdentity && (
                          <div className="text-xs text-slate-500 font-mono mt-0.5">{campaign.sendingIdentity}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-700">{company?.name || 'Unknown'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1.5 items-start">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusConf.classes}`}>
                            {statusConf.label}
                          </span>
                          {(() => {
                            const readiness = computeCampaignReadiness(campaign.status, campaign.senders);
                            if (readiness.state === 'READY') {
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  {readiness.eligibleSenderCount} Sender{readiness.eligibleSenderCount > 1 ? 's' : ''} Ready
                                </span>
                              );
                            }
                            if (readiness.state === 'NEEDS_SENDER') {
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                                  Needs Sender
                                </span>
                              );
                            }
                            if (readiness.state === 'ALL_SENDERS_INELIGIBLE' || readiness.state === 'READINESS_UNKNOWN') {
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                                  Sender Issues
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                        {new Date(campaign.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        {campaign.status === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => pauseMutation.mutate(campaign.id)}
                            disabled={pauseMutation.isPending}
                            className="inline-flex items-center px-2.5 py-1.5 border border-slate-200 text-xs font-medium rounded text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900"
                          >
                            Pause
                          </button>
                        )}
                        {campaign.status === 'PAUSED' && (
                          <button
                            type="button"
                            onClick={() => resumeMutation.mutate(campaign.id)}
                            disabled={resumeMutation.isPending}
                            className="inline-flex items-center px-2.5 py-1.5 border border-slate-200 text-xs font-medium rounded text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900"
                          >
                            Resume
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => navigate({ to: '/campaigns/$campaignId/review', params: { campaignId: campaign.id } })}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900"
                        >
                          {getActionLabel(campaign.status)}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Cards View */}
          <div className="md:hidden space-y-4">
            {filteredCampaigns.map((campaign) => {
              const company = companies?.find((c) => c.id === campaign.companyId);
              const statusConf = getStatusConfig(campaign.status);

              return (
                <div key={campaign.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 leading-tight">{campaign.name}</h3>
                      <p className="text-xs text-slate-600 mt-0.5">{company?.name || 'Unknown'}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusConf.classes}`}>
                      {statusConf.label}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                    {campaign.status === 'ACTIVE' && (
                      <button
                        type="button"
                        onClick={() => pauseMutation.mutate(campaign.id)}
                        disabled={pauseMutation.isPending}
                        className="w-full inline-flex justify-center items-center px-4 py-2 border border-slate-200 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 min-h-[44px]"
                      >
                        Pause Campaign
                      </button>
                    )}
                    {campaign.status === 'PAUSED' && (
                      <button
                        type="button"
                        onClick={() => resumeMutation.mutate(campaign.id)}
                        disabled={resumeMutation.isPending}
                        className="w-full inline-flex justify-center items-center px-4 py-2 border border-slate-200 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 min-h-[44px]"
                      >
                        Resume Campaign
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate({ to: '/campaigns/$campaignId/review', params: { campaignId: campaign.id } })}
                      className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-slate-900 hover:bg-slate-800 min-h-[44px]"
                    >
                      {getActionLabel(campaign.status)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
