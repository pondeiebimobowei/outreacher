import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { CompanyDto, CompanyStatus, createCompany, fetchCompanies } from '../../api/companies';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';

export const Route = createFileRoute('/_authed/companies')({
  component: CompaniesRouteComponent,
});

function CompaniesRouteComponent() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CompanyStatus>('ACTIVE');

  // Form State
  const [nameInput, setNameInput] = useState('');
  const [websiteUrlInput, setWebsiteUrlInput] = useState('');
  const [industryInput, setIndustryInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  // Modal focus ref
  const nameInputRef = useRef<HTMLInputElement>(null);
  const modalTriggerRef = useRef<HTMLButtonElement>(null);

  // Query companies list
  const {
    data: companies,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CompanyDto[]>({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: createCompany,
    onSuccess: (newCompany) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      closeModal();
      navigate({ to: '/companies/$id', params: { id: newCompany.id } });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.statusCode === 409) {
        setFormError('A company with this name already exists in your workspace.');
        setDuplicateId(err.existingCompanyId ?? null);
      } else if (err instanceof ApiError) {
        setFormError(err.message);
        setDuplicateId(null);
      } else {
        setFormError('Failed to create company. Please try again.');
        setDuplicateId(null);
      }
    },
  });

  const openModal = () => {
    setNameInput('');
    setWebsiteUrlInput('');
    setIndustryInput('');
    setLocationInput('');
    setDescriptionInput('');
    setFormError(null);
    setDuplicateId(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormError(null);
    setDuplicateId(null);
    modalTriggerRef.current?.focus();
  };

  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isModalOpen]);

  // Handle Escape key inside modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setDuplicateId(null);

    if (!nameInput.trim()) {
      setFormError('Company name is required.');
      return;
    }

    createMutation.mutate({
      name: nameInput.trim(),
      websiteUrl: websiteUrlInput.trim() || null,
      industry: industryInput.trim() || null,
      location: locationInput.trim() || null,
      description: descriptionInput.trim() || null,
    });
  };

  // Client-side filtering & search
  const filteredCompanies = (companies ?? []).filter((comp) => {
    const matchesStatus = statusFilter === 'ALL' ? true : comp.status === statusFilter;
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      comp.name.toLowerCase().includes(query) ||
      comp.normalizedName.includes(query) ||
      (comp.domain && comp.domain.toLowerCase().includes(query)) ||
      (comp.industry && comp.industry.toLowerCase().includes(query)) ||
      (comp.location && comp.location.toLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });

  if (isLoading) {
    return <LoadingState message="Loading target companies..." />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Failed to Load Companies"
        message={
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while loading companies.'
        }
        onRetry={() => refetch()}
      />
    );
  }

  const hasCompanies = (companies ?? []).length > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Target Companies</h1>
          <p className="mt-1 text-sm text-slate-600">
            Target companies you genuinely want to pursue to evaluate openings, contacts, and
            evidence.
          </p>
        </div>
        <button
          ref={modalTriggerRef}
          onClick={openModal}
          type="button"
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-colors shadow-sm"
        >
          Add Company
        </button>
      </div>

      {/* List Toolbar (Search & Filter) */}
      {hasCompanies && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search companies by name, domain, industry..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-md placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Status:
            </span>
            <div className="inline-flex rounded-md shadow-sm border border-slate-300 bg-white p-0.5">
              {(['ACTIVE', 'ARCHIVED', 'ALL'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {st === 'ALL' ? 'All' : st === 'ACTIVE' ? 'Active' : 'Archived'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {!hasCompanies ? (
        <EmptyState
          title="No Companies Added Yet"
          description="Start by adding a target company you genuinely want to pursue. CareerOS will help you evaluate research, openings, contacts, and evidence."
          actionLabel="Add Company"
          onAction={openModal}
        />
      ) : filteredCompanies.length === 0 ? (
        <div className="py-12 text-center bg-white rounded-lg border border-slate-200">
          <p className="text-sm font-medium text-slate-900">No matching companies found</p>
          <p className="mt-1 text-xs text-slate-500">Try adjusting your search filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCompanies.map((company) => (
            <div
              key={company.id}
              onClick={() => navigate({ to: '/companies/$id', params: { id: company.id } })}
              className="group cursor-pointer bg-white p-5 rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-slate-900 group-hover:text-slate-700">
                    {company.name}
                  </h2>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      company.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {company.status}
                  </span>
                </div>

                {company.domain && (
                  <p className="mt-1 text-xs font-mono text-slate-500">{company.domain}</p>
                )}

                {company.description && (
                  <p className="mt-2 text-xs text-slate-600 line-clamp-2">{company.description}</p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>{company.industry || company.location || 'Company Workspace'}</span>
                <span className="font-medium text-slate-900 group-hover:underline">
                  View Workspace &rarr;
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Company Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-company-modal-title"
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200 relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h2 id="add-company-modal-title" className="text-lg font-semibold text-slate-900">
                Add Target Company
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                aria-label="Close dialog"
              >
                &times;
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-2"
              >
                <p className="font-medium">{formError}</p>
                {duplicateId && (
                  <button
                    type="button"
                    onClick={() => {
                      closeModal();
                      navigate({
                        to: '/companies/$id',
                        params: { id: duplicateId },
                      });
                    }}
                    className="inline-flex items-center px-2.5 py-1.5 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded transition-colors"
                  >
                    View Existing Company &rarr;
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Company Name <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  placeholder="e.g. Acme Corporation"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Company Website / Domain (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://www.acme.com"
                  value={websiteUrlInput}
                  onChange={(e) => setWebsiteUrlInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Industry (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Fintech"
                    value={industryInput}
                    onChange={(e) => setIndustryInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Location (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. San Francisco, CA"
                    value={locationInput}
                    onChange={(e) => setLocationInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Description / Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief context about why you want to pursue this company..."
                  value={descriptionInput}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md transition-colors shadow-sm"
                >
                  {createMutation.isPending ? 'Adding Company...' : 'Add Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
