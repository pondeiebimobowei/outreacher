/* eslint-disable */
// @ts-nocheck
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchCompanies } from '../../api/companies';
import { LoadingState, ErrorState, EmptyState } from '../../components/states';
import { Briefcase, Building2 } from 'lucide-react';

export const Route = createFileRoute('/_authed/opportunities/')({
  component: OpportunitiesIndexComponent,
});

function OpportunitiesIndexComponent() {
  const { data: companies, isLoading, error } = useQuery({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', color: 'var(--color-primary)' }}>
            Opportunities
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Evaluate and track potential roles across companies.
          </p>
        </div>
      </div>
      
      {/* Info note */}
      <div className="mb-6 p-4 rounded-lg border bg-indigo-50 border-indigo-200">
        <p className="text-sm text-indigo-700 flex items-center gap-2">
          <Briefcase className="w-4 h-4" />
          Opportunities are discovered during company research and tracked in their workspaces.
        </p>
      </div>

      {isLoading && <LoadingState message="Loading companies..." />}
      {error && <ErrorState message="Failed to load companies." />}
      {companies && companies.length === 0 && (
        <EmptyState 
          icon={<Briefcase className="w-8 h-8 text-gray-400" />}
          title="No opportunities found" 
          description="Research a company to find relevant roles and opportunities." 
        />
      )}

      {companies && companies.length > 0 && (
        <div className="grid gap-3">
          {companies.map(company => (
            <div key={company.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 border shadow-sm">
                  <span className="bg-white text-gray-700 text-sm font-semibold">
                    {company.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{company.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span variant="outline" className="text-xs bg-white text-gray-600">
                      <Building2 className="w-3 h-3 mr-1" />
                      {company.industry || 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <button variant="secondary" size="sm" asChild>
                  <Link to={`/companies/$companyId`} params={{ companyId: company.id }}>
                    View Workspace
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
