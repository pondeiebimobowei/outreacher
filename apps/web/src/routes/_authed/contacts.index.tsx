import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { fetchCompanies, CompanyDto } from '../../api/companies';
import { LoadingState, ErrorState, EmptyState } from '../../components/states';
import { HugeiconsIcon } from '@hugeicons/react';
import { Building02Icon, UsersIcon, SearchIcon, ArrowRightIcon, MapPinIcon, GlobeIcon } from '@hugeicons/core-free-icons';;

export const Route = createFileRoute('/_authed/contacts/')({
  component: ContactsIndexComponent,
});

const COMPANY_AVATAR_COLORS = [
  '#1D4ED8', // blue
  '#0F766E', // teal
  '#7C3AED', // purple
  '#B45309', // amber
  '#0369A1', // sky
  '#BE185D', // pink
  '#065F46', // emerald
  '#4338CA', // indigo
];

function getCompanyColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return COMPANY_AVATAR_COLORS[hash % COMPANY_AVATAR_COLORS.length];
}

function getCompanyInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (name.slice(0, 2) || 'CO').toUpperCase();
}

function CompanyContactPortalCard({ company }: { company: CompanyDto }) {
  const avatarBg = getCompanyColor(company.name || company.id);
  const initials = getCompanyInitials(company.name || 'CO');

  return (
    <div className="p-4 sm:p-5 bg-slate-50 rounded-none-none border border-slate-200 hover:border-slate-300 hover:  flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start sm:items-center gap-4 min-w-0">
        <div
          className="w-11 h-11 rounded-none-none flex items-center justify-center font-bold text-sm text-white shrink-0 -xs"
          style={{
            backgroundColor: avatarBg,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className="text-base font-bold text-slate-900 truncate"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {company.name}
            </h3>
            {company.status === 'ACTIVE' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-none-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-slate-500">
            {company.industry && (
              <span className="inline-flex items-center gap-1 font-medium bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-none">
                <HugeiconsIcon icon={Building02Icon} className="w-3 h-3 text-slate-400" />
                {company.industry}
              </span>
            )}
            {company.location && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <HugeiconsIcon icon={MapPinIcon} className="w-3 h-3 text-slate-400" />
                {company.location}
              </span>
            )}
            {(company.domain || company.websiteUrl) && (
              <span className="inline-flex items-center gap-1 text-slate-500 truncate max-w-xs">
                <HugeiconsIcon icon={GlobeIcon} className="w-3 h-3 text-slate-400" />
                {company.domain || company.websiteUrl?.replace(/^https?:\/\//, '')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center sm:self-center">
        <Link
          to={`/companies/$id`}
          params={{ id: company.id }}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-none-none text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 border border-slate-200/80  focus:outline-none focus:ring-2 focus:ring-slate-900"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          <span>Explore Contacts</span>
          <HugeiconsIcon icon={ArrowRightIcon} className="w-3.5 h-3.5 text-slate-400" />
        </Link>
      </div>
    </div>
  );
}

export function ContactsIndexComponent() {
  const { data: companies, isLoading, error } = useQuery({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  });

  const [search, setSearch] = useState('');

  const filteredCompanies = useMemo(() => {
    if (!companies) return [];
    if (!search.trim()) return companies;
    const q = search.trim().toLowerCase();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.industry && c.industry.toLowerCase().includes(q)) ||
        (c.domain && c.domain.toLowerCase().includes(q)) ||
        (c.location && c.location.toLowerCase().includes(q)),
    );
  }, [companies, search]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight text-slate-900"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Contacts
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Contacts are evaluated and discovered within company workspaces. Select a company to discover and evaluate people.
          </p>
        </div>
      </div>

      {/* Info note */}
      <div className="mb-6 p-4 rounded-none-none border border-indigo-100 bg-indigo-50/70 text-indigo-950 flex items-start gap-3">
        <HugeiconsIcon icon={UsersIcon} className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-xs sm:text-sm leading-relaxed text-indigo-900">
          Outreacher models contacts per target company to ensure role relevance and verified evidence. Open any company workspace below to run discovery or review candidate decision-makers.
        </p>
      </div>

      {/* Search Bar */}
      {companies && companies.length > 0 && (
        <div className="mb-5 relative">
          <HugeiconsIcon icon={SearchIcon} className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies by name, industry, domain, or location..."
            className="w-full pl-10 pr-4 py-2.5 rounded-none-none border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 "
          />
        </div>
      )}

      {isLoading && <LoadingState message="Loading companies..." />}
      {error && <ErrorState message="Failed to load companies." />}

      {companies && companies.length === 0 && (
        <EmptyState
          title="No contacts found"
          description="Start by adding a target company to evaluate contacts."
        />
      )}

      {companies && companies.length > 0 && filteredCompanies.length === 0 && (
        <div className="p-8 text-center bg-slate-50 rounded-none-none border border-slate-200">
          <p className="text-sm text-slate-600">No companies match your search.</p>
          <button
            type="button"
            onClick={() => setSearch('')}
            className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
          >
            Clear search
          </button>
        </div>
      )}

      {filteredCompanies.length > 0 && (
        <div className="grid gap-3">
          {filteredCompanies.map((company) => (
            <CompanyContactPortalCard key={company.id} company={company} />
          ))}
        </div>
      )}
    </div>
  );
}
