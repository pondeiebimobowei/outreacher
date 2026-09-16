import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/companies')({
  component: CompaniesPlaceholderComponent,
});

function CompaniesPlaceholderComponent() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Companies</h1>
      <p className="mt-2 text-sm text-slate-600">Companies workspace route boundary placeholder.</p>
    </div>
  );
}
