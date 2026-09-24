import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchCampaigns } from '../../api/campaigns';
import { LoadingState, ErrorState, EmptyState } from '../../components/states';
import { MessageSquare } from 'lucide-react';

export const Route = createFileRoute('/_authed/conversations/')({
  component: ConversationsIndexComponent,
});

function ConversationsIndexComponent() {
  const { data: campaigns, isLoading, error } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', color: 'var(--color-primary)' }}>
            Conversations
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor and manage active discussions.
          </p>
        </div>
      </div>
      
      {/* Info note */}
      <div className="mb-6 p-4 rounded-lg border bg-indigo-50 border-indigo-200">
        <p className="text-sm text-indigo-700 flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          Conversations are securely managed within campaigns.
        </p>
      </div>

      {isLoading && <LoadingState message="Loading campaigns..." />}
      {error && <ErrorState message="Failed to load campaigns." />}
      {campaigns && campaigns.length === 0 && (
        <EmptyState 
          title="No conversations yet" 
          description="Start a campaign to engage with contacts and track responses here." 
        />
      )}

      {campaigns && campaigns.length > 0 && (
        <div className="grid gap-3">
          {campaigns.map(campaign => (
            <div key={campaign.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 transition-colors">
              <div>
                <h3 className="font-semibold text-gray-900">{campaign.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${campaign.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                    {campaign.status}
                  </span>
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
