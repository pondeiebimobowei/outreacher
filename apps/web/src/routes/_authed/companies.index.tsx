import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { CompanyDto, createCompany, fetchCompanies, updateCompany } from '../../api/companies';
import { Search, Plus, Archive, ArchiveRestore, MoreHorizontal, } from 'lucide-react';

export const Route = createFileRoute('/_authed/companies/')({
  component: CompaniesRouteComponent,
});

const MONOGRAM_COLORS = [
  { bg: '#EEF2FF', text: '#4F46E5' },
  { bg: '#FDF4FF', text: '#9333EA' },
  { bg: '#ECFDF5', text: '#059669' },
  { bg: '#FFF7ED', text: '#D97706' },
  { bg: '#EFF6FF', text: '#1D4ED8' },
  { bg: '#FEF2F2', text: '#DC2626' },
  { bg: '#F0FDF4', text: '#16A34A' },
];

function getMonogramColor(name: string): { bg: string; text: string } {
  if (!name) return MONOGRAM_COLORS[0];
  const idx = name.charCodeAt(0) % MONOGRAM_COLORS.length;
  return MONOGRAM_COLORS[idx];
}

function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap"
        style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.04em' }}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#10B981' }} />
        ACTIVE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ background: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.04em' }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#6B7280' }} />
      ARCHIVED
    </span>
  );
}

function Monogram({ name, isArchived }: { name: string; isArchived?: boolean }) {
  const { bg, text } = getMonogramColor(name);
  return (
    <div className="w-10 h-10 rounded-[10px] flex items-center justify-center font-bold text-[14px] shrink-0"
      style={{ background: isArchived ? 'var(--color-muted)' : bg, color: isArchived ? 'var(--color-muted-fg)' : text, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      {getInitials(name)}
    </div>
  );
}

function formatRelativeDate(isoString: string) {
  const date = new Date(isoString);
  const now = new Date();
  const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  if (diffHours < 24) {
    if (diffHours === 0) return 'Just now';
    return `${diffHours} hr ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function FilterBar({
  archiveFilter, setArchiveFilter, search, setSearch
}: {
  archiveFilter: 'ACTIVE' | 'ARCHIVED',
  setArchiveFilter: (val: 'ACTIVE' | 'ARCHIVED') => void,
  search: string,
  setSearch: (val: string) => void
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center p-1 rounded-lg" style={{ background: 'var(--color-muted)', border: '1px solid var(--color-border)' }}>
        <button onClick={() => setArchiveFilter('ACTIVE')}
          className="px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all"
          style={{
            background: archiveFilter === 'ACTIVE' ? 'var(--color-card)' : 'transparent',
            color: archiveFilter === 'ACTIVE' ? 'var(--color-primary)' : 'var(--color-muted-fg)',
            boxShadow: archiveFilter === 'ACTIVE' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
          }}>
          Active
        </button>
        <button onClick={() => setArchiveFilter('ARCHIVED')}
          className="px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all"
          style={{
            background: archiveFilter === 'ARCHIVED' ? 'var(--color-card)' : 'transparent',
            color: archiveFilter === 'ARCHIVED' ? 'var(--color-primary)' : 'var(--color-muted-fg)',
            boxShadow: archiveFilter === 'ARCHIVED' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
          }}>
          Archived
        </button>
      </div>
      <div className="relative w-full sm:w-64 shrink-0">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted-fg)' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search companies..."
          className="w-full pl-9 pr-4 py-2 rounded-lg text-[13.5px] outline-none transition-all"
          style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', color: 'var(--color-primary)' }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--color-accent)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
        />
      </div>
    </div>
  );
}

function ColumnHeaders() {
  return (
    <div className="hidden sm:flex items-center gap-4 px-5 py-2.5" style={{ background: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)' }}>
      <div className="w-[220px] shrink-0 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted-fg)' }}>Company</div>
      <div className="w-[140px] shrink-0 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted-fg)' }}>Status</div>
      <div className="flex-1 min-w-0 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted-fg)' }}>Industry</div>
      <div className="w-[120px] shrink-0 text-[11px] font-bold uppercase tracking-wider text-right" style={{ color: 'var(--color-muted-fg)' }}>Last updated</div>
      <div className="w-[140px] shrink-0 text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted-fg)' }}>Location</div>
      <div className="w-8 shrink-0"></div>
    </div>
  );
}

function CompanyRow({ company, onClick, onArchive, onUnarchive }: {
  company: CompanyDto;
  onClick: () => void;
  onArchive: (e: React.MouseEvent) => void;
  onUnarchive: (e: React.MouseEvent) => void;
}) {
  const isArchived = company.status === 'ARCHIVED';
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  return (
    <div
      className="cursor-pointer transition-colors"
      style={{ borderBottom: '1px solid var(--color-border)', opacity: isArchived ? 0.6 : 1 }}
      onClick={onClick}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-muted)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Mobile card */}
      <div className="sm:hidden px-4 py-4 flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Monogram name={company.name} isArchived={isArchived} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {company.name}
                </p>
                {isArchived && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--color-muted)', color: 'var(--color-muted-fg)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                    Archived
                  </span>
                )}
              </div>
              <p className="text-[12px] truncate" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}>
                {company.domain || company.websiteUrl || 'No domain'}
              </p>
            </div>
          </div>
          <div className="shrink-0 relative" ref={menuRef}>
            <button
              onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: 'var(--color-muted-fg)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-lg py-1 shadow-lg z-10" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
                {isArchived ? (
                  <button onClick={onUnarchive} className="w-full text-left px-3 py-2 text-[13px] hover:bg-slate-50 flex items-center gap-2">
                    <ArchiveRestore className="w-3.5 h-3.5" /> Unarchive
                  </button>
                ) : (
                  <button onClick={onArchive} className="w-full text-left px-3 py-2 text-[13px] hover:bg-slate-50 flex items-center gap-2 text-rose-600">
                    <Archive className="w-3.5 h-3.5" /> Archive
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <StatusBadge status={company.status} />
          <span className="text-[12px]" style={{ color: 'var(--color-muted-fg)' }}>
            Updated {formatRelativeDate(company.updatedAt)}
          </span>
        </div>
      </div>

      {/* Desktop row */}
      <div className="hidden sm:flex items-center gap-4 px-5 py-3.5">
        <div className="w-[220px] shrink-0 flex items-center gap-3 min-w-0">
          <Monogram name={company.name} isArchived={isArchived} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {company.name}
              </p>
              {isArchived && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--color-muted)', color: 'var(--color-muted-fg)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  Archived
                </span>
              )}
            </div>
            <p className="text-[12px] truncate" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}>
              {company.domain || company.websiteUrl || 'No domain'}
            </p>
          </div>
        </div>
        <div className="w-[140px] shrink-0"><StatusBadge status={company.status} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] truncate" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}>
            {company.industry || '—'}
          </p>
        </div>
        <div className="w-[120px] shrink-0 text-right">
          <p className="text-[12.5px]" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}>
            {formatRelativeDate(company.updatedAt)}
          </p>
        </div>
        <div className="w-[140px] shrink-0 pl-4">
          <span className="text-[13px] truncate block" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}>
            {company.location || '—'}
          </span>
        </div>
        {/* Row actions */}
        <div className="w-8 shrink-0 relative" ref={menuRef}>
          <button
            onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors opacity-0 group-hover:opacity-100"
            style={{ color: 'var(--color-muted-fg)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-40 rounded-lg py-1 shadow-lg z-10" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
              {isArchived ? (
                <button onClick={onUnarchive} className="w-full text-left px-3 py-2 text-[13px] hover:bg-slate-50 flex items-center gap-2" style={{ color: 'var(--color-primary)' }}>
                  <ArchiveRestore className="w-3.5 h-3.5" /> Unarchive
                </button>
              ) : (
                <button onClick={onArchive} className="w-full text-left px-3 py-2 text-[13px] hover:bg-rose-50 flex items-center gap-2 text-rose-600">
                  <Archive className="w-3.5 h-3.5" /> Archive
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyStateList({ searching, onAdd }: { searching: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-8">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-muted)', color: 'var(--color-muted-fg)' }}>
        <Search className="w-5 h-5" />
      </div>
      <p className="text-[15px] font-semibold" style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
        {searching ? 'No companies found' : 'No companies yet'}
      </p>
      <p className="text-[13.5px] text-center max-w-[280px]" style={{ color: 'var(--color-muted-fg)' }}>
        {searching ? 'Try adjusting your search or filters.' : 'Add your first target company to begin researching and finding contacts.'}
      </p>
      {!searching && (
        <button onClick={onAdd} className="mt-2 text-[13px] font-medium" style={{ color: 'var(--color-accent)' }}>
          Add company →
        </button>
      )}
    </div>
  );
}

function CompaniesRouteComponent() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [archiveTarget, setArchiveTarget] = useState<CompanyDto | null>(null);

  // Form State
  const [nameInput, setNameInput] = useState('');
  const [websiteUrlInput, setWebsiteUrlInput] = useState('');
  const [industryInput, setIndustryInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);

  const { data: companies = [], isLoading } = useQuery<CompanyDto[]>({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  });

  const createMutation = useMutation({
    mutationFn: createCompany,
    onSuccess: (newCompany) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setIsModalOpen(false);
      navigate({ to: '/companies/$id', params: { id: newCompany.id } });
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError('Failed to create company.');
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string, input: any }) => updateCompany(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setArchiveTarget(null);
    }
  });

  const handleArchive = (company: CompanyDto) => {
    updateMutation.mutate({ id: company.id, input: { status: 'ARCHIVED' } });
  };
  const handleUnarchive = (company: CompanyDto) => {
    updateMutation.mutate({ id: company.id, input: { status: 'ACTIVE' } });
  };

  const workingEntries = companies.filter(c => c.status === archiveFilter);
  const filtered = workingEntries.filter(c => {
    return c.name.toLowerCase().includes(search.toLowerCase()) || 
           (c.domain && c.domain.toLowerCase().includes(search.toLowerCase()));
  });

  const isEmpty = companies.length === 0;
  const isWorkingEmpty = !isEmpty && workingEntries.length === 0;
  const isSearchEmpty = !isEmpty && !isWorkingEmpty && filtered.length === 0;
  const isSearching = search.length > 0;
  const hasArchivedEntries = companies.some(c => c.status === 'ARCHIVED');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Companies
          </h1>
          <p className="text-[14.5px] mt-1 max-w-[480px] leading-relaxed" style={{ color: 'var(--color-muted-fg)' }}>
            Companies are the starting point for every opportunity. Research a company, find the right person, and reach out with evidence.
          </p>
        </div>
        <button
          onClick={() => {
            setNameInput(''); setWebsiteUrlInput(''); setIndustryInput(''); setLocationInput(''); setFormError(null);
            setIsModalOpen(true);
          }}
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13.5px] font-semibold transition-all"
          style={{ background: 'var(--color-primary)', color: 'white', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1E2D4A')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-primary)')}
        >
          <Plus className="w-4 h-4" /> Add company
        </button>
      </div>

      {!isEmpty && (
        <div className="mb-4">
          <FilterBar
            archiveFilter={archiveFilter}
            setArchiveFilter={f => { setArchiveFilter(f); setSearch(''); }}
            search={search}
            setSearch={setSearch}
          />
        </div>
      )}

      {/* List Container */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}>
        {isLoading ? (
          <><ColumnHeaders /><div className="p-8 text-center text-sm text-slate-500">Loading companies...</div></>
        ) : isEmpty ? (
          <EmptyStateList searching={false} onAdd={() => setIsModalOpen(true)} />
        ) : isWorkingEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-8">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--color-muted)', color: 'var(--color-muted-fg)' }}>
              <Archive className="w-5 h-5" />
            </div>
            <p className="text-[15px] font-semibold" style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              No archived companies
            </p>
            <p className="text-[13.5px] text-center max-w-[280px]" style={{ color: 'var(--color-muted-fg)' }}>
              Archive a company to remove it from your active pipeline while keeping its history.
            </p>
            <button onClick={() => setArchiveFilter('ACTIVE')} className="text-[13px] font-medium" style={{ color: 'var(--color-accent)' }}>
              View active companies →
            </button>
          </div>
        ) : isSearchEmpty ? (
          <><ColumnHeaders /><EmptyStateList searching={true} onAdd={() => setIsModalOpen(true)} /></>
        ) : (
          <>
            <ColumnHeaders />
            {filtered.map(company => (
              <CompanyRow
                key={company.id}
                company={company}
                onClick={() => navigate({ to: '/companies/$id', params: { id: company.id } })}
                onArchive={(e) => { e.stopPropagation(); setArchiveTarget(company); }}
                onUnarchive={(e) => { e.stopPropagation(); handleUnarchive(company); }}
              />
            ))}
            {isSearching && (
              <div className="px-5 py-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                <span className="text-[12.5px]" style={{ color: 'var(--color-muted-fg)' }}>
                  Showing {filtered.length} of {workingEntries.length} {workingEntries.length === 1 ? 'company' : 'companies'}
                </span>
                <button onClick={() => setSearch('')}
                  className="text-[12.5px] font-medium" style={{ color: 'var(--color-accent)' }}>
                  Clear filters
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {!isEmpty && archiveFilter === 'ACTIVE' && hasArchivedEntries && (
        <div className="mt-3 flex items-center justify-center">
          <button
            onClick={() => { setArchiveFilter('ARCHIVED'); setSearch(''); }}
            className="text-[12.5px] font-medium transition-colors"
            style={{ color: 'var(--color-muted-fg)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted-fg)')}
          >
            View archived companies ({companies.filter(c => c.status === 'ARCHIVED').length}) →
          </button>
        </div>
      )}

      {/* Modals */}
      {isModalOpen && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setIsModalOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-slate-200"
            onClick={e => e.stopPropagation()}>
            <h2 className="text-[20px] font-bold mb-4" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Add Target Company
            </h2>
            {formError && (
              <div role="alert" className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-[13px] text-rose-700 font-medium">
                {formError}
              </div>
            )}
            <form onSubmit={e => {
              e.preventDefault();
              createMutation.mutate({
                name: nameInput, websiteUrl: websiteUrlInput, industry: industryInput, location: locationInput
              });
            }} className="space-y-4">
              <div>
                <label htmlFor="company-name" className="block text-[13px] font-medium mb-1" style={{ color: 'var(--color-primary)' }}>Company Name *</label>
                <input id="company-name" ref={nameInputRef} type="text" required value={nameInput} onChange={e => setNameInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-[14px] border border-slate-300 outline-none focus:border-[var(--color-accent)]" />
              </div>
              <div>
                <label htmlFor="company-website" className="block text-[13px] font-medium mb-1" style={{ color: 'var(--color-primary)' }}>Website URL (Optional)</label>
                <input id="company-website" type="url" value={websiteUrlInput} onChange={e => setWebsiteUrlInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-[14px] border border-slate-300 outline-none focus:border-[var(--color-accent)]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="company-industry" className="block text-[13px] font-medium mb-1" style={{ color: 'var(--color-primary)' }}>Industry (Optional)</label>
                  <input id="company-industry" type="text" value={industryInput} onChange={e => setIndustryInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-[14px] border border-slate-300 outline-none focus:border-[var(--color-accent)]" />
                </div>
                <div>
                  <label htmlFor="company-location" className="block text-[13px] font-medium mb-1" style={{ color: 'var(--color-primary)' }}>Location (Optional)</label>
                  <input id="company-location" type="text" value={locationInput} onChange={e => setLocationInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-[14px] border border-slate-300 outline-none focus:border-[var(--color-accent)]" />
                </div>
              </div>
              <div className="pt-4 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-[13.5px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={createMutation.isPending}
                  className="px-4 py-2 rounded-lg text-[13.5px] font-semibold transition-colors disabled:opacity-50"
                  style={{ background: 'var(--color-primary)', color: 'white', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {createMutation.isPending ? 'Adding...' : 'Add Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {archiveTarget && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setArchiveTarget(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-slate-200 text-center"
            onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center bg-rose-100 text-rose-600 mb-4">
              <Archive className="w-6 h-6" />
            </div>
            <h2 className="text-[18px] font-bold mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Archive {archiveTarget.name}?
            </h2>
            <p className="text-[13px] text-slate-500 mb-6 leading-relaxed">
              Archiving hides this company from active views. You can unarchive it later from the Archived filter.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setArchiveTarget(null)} className="flex-1 py-2 rounded-lg text-[13.5px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleArchive(archiveTarget)} disabled={updateMutation.isPending}
                className="flex-1 py-2 rounded-lg text-[13.5px] font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors">
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
