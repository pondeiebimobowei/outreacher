import { useState, useMemo } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueries } from '@tanstack/react-query';
import { fetchCompanies, type CompanyDto } from '../../api/companies';
import { fetchCompanyResearch, type OpportunityDto } from '../../api/research';
import { HugeiconsIcon } from '@hugeicons/react';
import { BriefcaseIcon, SearchIcon } from '@hugeicons/core-free-icons';;
import { OpportunityCard } from '../../features/opportunity/components/OpportunityCard';
import { OPP_STATUS_CFG, ClassificationType } from '../../features/opportunity/components/OpportunityClassificationBadge';
import { getEffectiveClassification } from '../../features/opportunity/utils';
import { LoadingState } from '../../components/states';

export const Route = createFileRoute('/_authed/opportunities/')({
  component: OpportunitiesIndexComponent,
});

type OppFilter = 'ALL' | ClassificationType;

function OpportunitiesIndexComponent() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<OppFilter>('ALL');
  const [search, setSearch] = useState('');

  const { data: companies, isLoading: isLoadingCompanies } = useQuery({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  });

  // Fetch research for all companies
  const researchQueries = useQueries({
    queries: (companies ?? []).map((company) => ({
      queryKey: ['company-research', company.id],
      queryFn: () => fetchCompanyResearch(company.id),
      staleTime: 60000,
    })),
  });

  const isLoadingResearch = researchQueries.some((q) => q.isLoading);
  const isLoading = isLoadingCompanies || (companies && companies.length > 0 && isLoadingResearch);

  // Flatten all opportunities with their company context
  const oppEntries = useMemo(() => {
    if (!companies) return [];
    const entries: { company: CompanyDto; opportunity: OpportunityDto }[] = [];
    companies.forEach((company, idx) => {
      const research = researchQueries[idx]?.data;
      if (research?.opportunities) {
        research.opportunities.forEach((opp) => {
          entries.push({ company, opportunity: opp });
        });
      }
    });
    return entries;
  }, [companies, researchQueries]);

  // Apply filter and search
  const filtered = useMemo(() => {
    return oppEntries.filter(({ company, opportunity }) => {
      const activeStatus = getEffectiveClassification(opportunity);
      const matchesFilter = filter === 'ALL' || activeStatus === filter;
      const searchLower = search.toLowerCase();
      const matchesSearch =
        company.name.toLowerCase().includes(searchLower) ||
        (company.domain || '').toLowerCase().includes(searchLower) ||
        opportunity.roleTitle?.toLowerCase().includes(searchLower);
      return matchesFilter && matchesSearch;
    });
  }, [oppEntries, filter, search]);

  // Count per classification
  const counts = useMemo(() => {
    const all = oppEntries.length;
    const confirmed = oppEntries.filter(({ opportunity }) => getEffectiveClassification(opportunity) === 'CONFIRMED').length;
    const proactive = oppEntries.filter(({ opportunity }) => getEffectiveClassification(opportunity) === 'PROACTIVE').length;
    const unclassified = oppEntries.filter(({ opportunity }) => getEffectiveClassification(opportunity) === 'UNCLASSIFIED').length;
    return { ALL: all, CONFIRMED: confirmed, PROACTIVE: proactive, UNCLASSIFIED: unclassified };
  }, [oppEntries]);

  if (isLoading && (!companies || companies.length === 0)) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <LoadingState message="Loading opportunities..." />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Opportunities
          </h1>
          <p className="text-[14px] mt-1" style={{ color: 'var(--color-muted-fg)', fontFamily: 'sans-serif' }}>
            Evidence-backed reasons to pursue a relationship with each company.
          </p>
        </div>
      </div>

      {oppEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-6 py-24 px-8">
          <div className="w-14 h-14 rounded-none-none flex items-center justify-center bg-gray-100 text-gray-500">
            <HugeiconsIcon icon={BriefcaseIcon} className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <div className="text-center max-w-md">
            <h2 className="text-[20px] font-bold mb-2 text-gray-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              No opportunities yet
            </h2>
            <p className="text-[14px] leading-relaxed text-gray-500" style={{ fontFamily: 'sans-serif' }}>
              Opportunities appear when your company research gives you a credible reason to pursue a relationship.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => navigate({ to: '/companies' })}
              className="flex items-center gap-2 px-5 py-2.5 rounded-none-none text-[13.5px] font-semibold  bg-gray-900 text-white hover:bg-gray-800"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Research a company
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <HugeiconsIcon icon={SearchIcon} className="w-4 h-4" />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search companies…"
                className="w-full pl-9 pr-3 py-2.5 rounded-none-none text-[13.5px] outline-none border border-gray-200 bg-gray-50 text-gray-900 focus:bg-slate-50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 "
                style={{ fontFamily: 'sans-serif' }}
              />
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap gap-2 mb-6">
            {(['ALL', 'CONFIRMED', 'PROACTIVE', 'UNCLASSIFIED'] as OppFilter[]).map((f) => {
              const count = counts[f];
              if (f !== 'ALL' && count === 0) return null;
              const isActive = filter === f;
              const cfg = f !== 'ALL' ? OPP_STATUS_CFG[f] : null;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-none-full  flex items-center gap-1.5"
                  style={{
                    background: isActive ? cfg?.bg ?? 'var(--color-primary)' : 'var(--color-muted)',
                    color: isActive ? cfg?.color ?? 'white' : 'var(--color-muted-fg)',
                    border: isActive ? `1px solid ${cfg?.border ?? 'transparent'}` : '1px solid var(--color-border)',
                    fontFamily: 'Plus Jakarta Sans, sans-serif',
                  }}
                >
                  {f === 'ALL' ? 'All' : cfg?.label} <span className={isActive ? 'opacity-90' : 'opacity-60'}>· {count}</span>
                </button>
              );
            })}
          </div>

          {/* Cards grid */}
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[14px] text-gray-500" style={{ fontFamily: 'sans-serif' }}>No opportunities match your filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(({ company, opportunity }) => (
                <OpportunityCard key={opportunity.id} company={company} opportunity={opportunity} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
