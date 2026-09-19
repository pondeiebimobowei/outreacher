import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/campaigns/')({
  component: CampaignsIndexComponent,
});

function CampaignsIndexComponent() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Campaigns</h1>
      <p className="mt-2 text-sm text-slate-600">Campaigns workspace route boundary placeholder.</p>
    </div>
  );
}
