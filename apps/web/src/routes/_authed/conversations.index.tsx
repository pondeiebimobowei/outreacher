/* eslint-disable */
// @ts-nocheck
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchCampaigns } from '../../api/campaigns';
import { LoadingState, ErrorState, EmptyState } from '../../components/states';
import { MessageSquare, AlertCircle } from 'lucide-react';

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
          icon={<MessageSquare className="w-8 h-8 text-gray-400" />}
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
                  <span variant={campaign.status === 'ACTIVE' ? 'default' : 'secondary'} className="text-xs">
                    {campaign.status}
                  </span>
                </div>
              </div>
              <div>
                <button variant="outline" size="sm" asChild>
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
