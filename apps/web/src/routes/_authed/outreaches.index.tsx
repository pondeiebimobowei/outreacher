/* eslint-disable */
// @ts-nocheck
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchCampaigns } from '../../api/campaigns';
import { LoadingState, ErrorState, EmptyState } from '../../components/states';
import { Send, Info } from 'lucide-react';

export const Route = createFileRoute('/_authed/outreaches/')({
  component: OutreachesIndexComponent,
});

function OutreachesIndexComponent() {
  const { data: campaigns, isLoading, error } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', color: 'var(--color-primary)' }}>
            Outreaches
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Outreaches are personalized and sent through campaigns.
          </p>
        </div>
      </div>
      
      <div className="mb-6 p-4 rounded-lg border bg-indigo-50 border-indigo-200">
        <p className="text-sm text-indigo-700 flex items-center gap-2">
          <Info className="w-4 h-4" />
          Outreaches are tracked per campaign. View a campaign to manage direct outreaches.
        </p>
      </div>

      {isLoading && <LoadingState message="Loading campaigns..." />}
      {error && <ErrorState message="Failed to load campaigns." />}
      {campaigns && campaigns.length === 0 && (
        <EmptyState 
          icon={<Send className="w-8 h-8 text-gray-400" />}
          title="No outreaches found" 
          description="Create a campaign and add contacts to start sending." 
        />
      )}

      {campaigns && campaigns.length > 0 && (
        <div className="grid gap-3">
          {campaigns.map(campaign => (
            <div key={campaign.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
              <div>
                <h3 className="font-semibold text-gray-900">{campaign.name}</h3>
                <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                  <span variant={campaign.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-xs">
                    {campaign.status}
                  </span>
                  {campaign.sendingIdentity && (
                    <span>• Sender: {campaign.sendingIdentity}</span>
                  )}
                </div>
              </div>
              <div>
                <button variant="secondary" size="sm" asChild>
                  <Link to={`/campaigns/$campaignId`} params={{ campaignId: campaign.id }}>
                    View Campaign
                  </Link>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
