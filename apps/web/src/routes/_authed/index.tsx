import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/')({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Home</h1>
      <p className="mt-2 text-sm text-slate-600">
        Career Outreach Platform application shell foundation.
      </p>
    </div>
  );
}
