import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchCampaigns } from '../../api/campaigns';
import { LoadingState, ErrorState, EmptyState } from '../../components/states';
import { Info } from 'lucide-react';

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
                  <span className={`text-xs px-2 py-0.5 rounded ${campaign.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                    {campaign.status}
                  </span>
                  {campaign.sendingIdentity && (
                    <span>• Sender: {campaign.sendingIdentity}</span>
                  )}
                </div>
              </div>
              <div>
                <Link to={`/campaigns/$campaignId/review`} params={{ campaignId: campaign.id }} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-sm font-medium rounded-md text-gray-900 inline-block">View Campaign</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
