import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { CompanyDto, CompanyStatus, fetchCompanyById, updateCompany } from '../../api/companies';
import { fetchCareerProfile } from '../../api/profile';
import { fetchCompanyResearch, startCompanyResearch } from '../../api/research';
import { ContactDiscoveryWorkspace } from '../../components/contact-discovery/contact-discovery-workspace';
import { ErrorState, LoadingState } from '../../components/states';

export const Route = createFileRoute('/_authed/companies/$id')({
  component: CompanyDetailRouteComponent,
});

function formatRelativeTime(dateString: string | null | undefined): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 0) {
    return date.toLocaleDateString();
  }
  if (diffInSeconds < 60) {
    return 'just now';
  }
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays}d ago`;
  }
  return date.toLocaleDateString();
}

function CompanyDetailRouteComponent() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Edit / Archive Form State
  const [isEditing, setIsEditing] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [websiteUrlInput, setWebsiteUrlInput] = useState('');
  const [industryInput, setIndustryInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [linkedinUrlInput, setLinkedinUrlInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  // Research UX State
  const [researchError, setResearchError] = useState<string | null>(null);
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState<Record<string, boolean>>({});
  const [ariaAnnouncement, setAriaAnnouncement] = useState<string>('');

  const prevStatusRef = useRef<string | null>(null);

  const {
    data: company,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<CompanyDto>({
    queryKey: ['company', id],
    queryFn: () => fetchCompanyById(id),
  });

  const { data: careerProfile } = useQuery({
    queryKey: ['career-profile'],
    queryFn: fetchCareerProfile,
  });

  const { data: researchDetails } = useQuery({
    queryKey: ['company-research', id],
    queryFn: () => fetchCompanyResearch(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === 'QUEUED' || data.status === 'RUNNING')) {
        return 2000;
      }
      return false;
    },
  });

  const rawResearchStatus = researchDetails?.status ?? 'NOT_STARTED';
  const hasExistingData =
    (researchDetails?.opportunities && researchDetails.opportunities.length > 0) ||
    Boolean(researchDetails?.run?.summary) ||
    (researchDetails?.evidence && researchDetails.evidence.length > 0);

  const isPollingBackground = rawResearchStatus === 'QUEUED' || rawResearchStatus === 'RUNNING';

  const isRefreshingState = isPollingBackground && hasExistingData;
  const isFirstRunLoading = isPollingBackground && !hasExistingData;

  // Track discrete status transitions for accessibility live region
  useEffect(() => {
    if (!researchDetails) return;
    const currentStatus = researchDetails.status;
    const prevStatus = prevStatusRef.current;

    if (prevStatus !== null && prevStatus !== currentStatus) {
      if (currentStatus === 'QUEUED' || currentStatus === 'RUNNING') {
        if (hasExistingData) {
          setAriaAnnouncement('Research is being updated.');
        } else {
          setAriaAnnouncement('Research started.');
        }
      } else if (currentStatus === 'COMPLETED' || currentStatus === 'PARTIAL') {
        setAriaAnnouncement('Research completed.');
      } else if (currentStatus === 'FAILED') {
        setAriaAnnouncement('Research failed.');
      }
    }

    prevStatusRef.current = currentStatus;
  }, [researchDetails, hasExistingData]);

  const startResearchMutation = useMutation({
    mutationFn: (options?: { forceRefresh?: boolean }) => startCompanyResearch(id, options),
    onSuccess: (res) => {
      setResearchError(null);
      queryClient.invalidateQueries({ queryKey: ['company-research', id] });
      if (res.reused) {
        setAriaAnnouncement('Research findings reused from 24 hour cache.');
      } else if (hasExistingData) {
        setAriaAnnouncement('Research is being updated.');
      } else {
        setAriaAnnouncement('Research started.');
      }
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.statusCode === 429) {
        setResearchError(
          'Maximum 3 forced refreshes per company per 24 hours reached. Existing research remains visible.',
        );
        setAriaAnnouncement('Research refresh rate limit reached.');
      } else if (err instanceof ApiError) {
        setResearchError(err.message);
        setAriaAnnouncement(`Research failed: ${err.message}`);
      } else {
        setResearchError('Failed to execute research.');
        setAriaAnnouncement('Research failed.');
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: Parameters<typeof updateCompany>[1]) => updateCompany(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(['company', id], updated);
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setIsEditing(false);
      setShowArchiveConfirm(false);
      setEditError(null);
      setDuplicateId(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.statusCode === 409) {
        setEditError('Another company in your workspace already uses this name.');
        setDuplicateId(err.existingCompanyId ?? null);
      } else if (err instanceof ApiError) {
        setEditError(err.message);
      } else {
        setEditError('Failed to update company.');
      }
    },
  });

  const toggleEvidenceExpanded = (evidenceId: string) => {
    setExpandedEvidenceIds((prev) => ({
      ...prev,
      [evidenceId]: !prev[evidenceId],
    }));
  };

  const startEdit = () => {
    if (!company) return;
    setNameInput(company.name);
    setWebsiteUrlInput(company.websiteUrl ?? '');
    setIndustryInput(company.industry ?? '');
    setLocationInput(company.location ?? '');
    setLinkedinUrlInput(company.linkedinUrl ?? '');
    setDescriptionInput(company.description ?? '');
    setEditError(null);
    setDuplicateId(null);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditError(null);
    setDuplicateId(null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setEditError(null);
    setDuplicateId(null);

    const patchPayload: Parameters<typeof updateCompany>[1] = {};

    if (nameInput.trim() !== company.name) {
      patchPayload.name = nameInput.trim();
    }
    const currentWeb = company.websiteUrl ?? '';
    const newWeb = websiteUrlInput.trim();
    if (newWeb !== currentWeb) {
      patchPayload.websiteUrl = newWeb === '' ? null : newWeb;
    }
    const currentInd = company.industry ?? '';
    const newInd = industryInput.trim();
    if (newInd !== currentInd) {
      patchPayload.industry = newInd === '' ? null : newInd;
    }
    const currentLoc = company.location ?? '';
    const newLoc = locationInput.trim();
    if (newLoc !== currentLoc) {
      patchPayload.location = newLoc === '' ? null : newLoc;
    }
    const currentLi = company.linkedinUrl ?? '';
    const newLi = linkedinUrlInput.trim();
    if (newLi !== currentLi) {
      patchPayload.linkedinUrl = newLi === '' ? null : newLi;
    }
    const currentDesc = company.description ?? '';
    const newDesc = descriptionInput.trim();
    if (newDesc !== currentDesc) {
      patchPayload.description = newDesc === '' ? null : newDesc;
    }

    if (Object.keys(patchPayload).length === 0) {
      setIsEditing(false);
      return;
    }

    updateMutation.mutate(patchPayload);
  };

  const toggleArchiveStatus = () => {
    if (!company) return;
    const nextStatus: CompanyStatus = company.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
    updateMutation.mutate({ status: nextStatus });
  };

  if (isLoading) {
    return <LoadingState message="Loading company workspace..." />;
  }

  if (isError || !company) {
    return (
      <ErrorState
        title="Company Workspace Not Found"
        message={
          error instanceof ApiError && error.statusCode === 404
            ? 'The requested target company does not exist or belongs to another workspace.'
            : error instanceof Error
              ? error.message
              : 'Failed to load company workspace.'
        }
        onRetry={() => refetch()}
      />
    );
  }

  const targetRoles = careerProfile?.targetRoles?.filter(Boolean) ?? [];
  const hasTargetRoles = targetRoles.length > 0;
  const completionRelative = formatRelativeTime(researchDetails?.run?.completedAt);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* ARIA Live region for discrete status announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {ariaAnnouncement}
      </div>

      {/* Navigation Breadcrumb */}
      <div>
        <button
          type="button"
          onClick={() => navigate({ to: '/companies' })}
          className="text-xs font-medium text-slate-500 hover:text-slate-900 inline-flex items-center space-x-1 focus:outline-none focus:ring-2 focus:ring-slate-900 rounded px-1 py-0.5"
        >
          <span>&larr; Back to Target Companies</span>
        </button>
      </div>

      {/* 1. WHERE AM I? - Company Identity Header & Research Status */}
      <section
        aria-labelledby="company-identity-heading"
        className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center space-x-3">
              <h1
                id="company-identity-heading"
                className="text-2xl font-bold tracking-tight text-slate-900"
              >
                {company.name}
              </h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${
                  company.status === 'ACTIVE'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {company.status}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                normalized: {company.normalizedName}
              </span>
              {company.domain && (
                <span className="font-mono text-slate-600 font-medium">{company.domain}</span>
              )}
              {company.industry && (
                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                  {company.industry}
                </span>
              )}
              {company.location && (
                <span className="text-slate-600 font-medium">&bull; {company.location}</span>
              )}
              {company.websiteUrl && (
                <a
                  href={company.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-900 hover:underline font-medium inline-flex items-center focus:outline-none focus:ring-2 focus:ring-slate-900 rounded px-1"
                >
                  Visit Website ↗
                </a>
              )}
              {company.linkedinUrl && (
                <a
                  href={company.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-900 hover:underline font-medium inline-flex items-center focus:outline-none focus:ring-2 focus:ring-slate-900 rounded px-1"
                >
                  LinkedIn ↗
                </a>
              )}
            </div>

            {company.description && (
              <p className="mt-2 text-xs text-slate-600 border-t border-slate-100 pt-2">
                {company.description}
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {!isEditing && (
              <button
                type="button"
                onClick={startEdit}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                Edit Details
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowArchiveConfirm(true)}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {company.status === 'ACTIVE' ? 'Archive Company' : 'Re-activate'}
            </button>
          </div>
        </div>

        {/* Live Research Banner & Controls */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-900">
                Research Status:
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold ${
                  isRefreshingState
                    ? 'bg-amber-100 text-amber-800 border border-amber-300 motion-reduce:animate-none animate-pulse'
                    : rawResearchStatus === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : rawResearchStatus === 'PARTIAL'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : rawResearchStatus === 'FAILED'
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : isFirstRunLoading
                            ? 'bg-sky-100 text-sky-800 border border-sky-300 motion-reduce:animate-none animate-pulse'
                            : 'bg-slate-200 text-slate-700'
                }`}
              >
                {isRefreshingState
                  ? 'REFRESHING IN BACKGROUND'
                  : rawResearchStatus === 'PARTIAL'
                    ? 'PARTIAL RESULTS'
                    : rawResearchStatus}
              </span>
              {researchDetails?.mock && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                  Mock Data Provider
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600">
              {rawResearchStatus === 'NOT_STARTED' &&
                'Execute research to analyze company background, signals, and openings.'}
              {isFirstRunLoading &&
                rawResearchStatus === 'QUEUED' &&
                'Research requested, waiting for worker slot...'}
              {isFirstRunLoading &&
                rawResearchStatus === 'RUNNING' &&
                'Analyzing company website and openings...'}
              {isRefreshingState &&
                'Updating research in background... Existing research findings remain visible below.'}
              {rawResearchStatus === 'COMPLETED' &&
                !isRefreshingState &&
                `Research completed${
                  completionRelative
                    ? ` (${completionRelative})`
                    : researchDetails?.run?.completedAt
                      ? ` on ${new Date(researchDetails.run.completedAt).toLocaleString()}`
                      : ''
                }.`}
              {rawResearchStatus === 'PARTIAL' &&
                !isRefreshingState &&
                'Research completed with partial findings. Some provider data was incomplete.'}
              {rawResearchStatus === 'FAILED' &&
                !isRefreshingState &&
                'Research run failed. Review error details or trigger a retry.'}
            </p>
          </div>

          <div className="flex items-center space-x-2 self-start sm:self-auto">
            {isFirstRunLoading && rawResearchStatus === 'QUEUED' && (
              <button
                type="button"
                disabled
                className="px-4 py-2 text-xs font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded-md cursor-not-allowed opacity-75 focus:outline-none"
              >
                Queued
              </button>
            )}

            {isFirstRunLoading && rawResearchStatus === 'RUNNING' && (
              <button
                type="button"
                disabled
                className="px-4 py-2 text-xs font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded-md cursor-not-allowed opacity-75 focus:outline-none"
              >
                Researching...
              </button>
            )}

            {isRefreshingState && (
              <button
                type="button"
                disabled
                className="px-4 py-2 text-xs font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded-md cursor-not-allowed opacity-75 focus:outline-none"
              >
                Refreshing...
              </button>
            )}

            {rawResearchStatus === 'NOT_STARTED' && !isPollingBackground && (
              <button
                type="button"
                onClick={() => startResearchMutation.mutate({})}
                disabled={startResearchMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {startResearchMutation.isPending ? 'Starting...' : 'Start Research'}
              </button>
            )}

            {(rawResearchStatus === 'COMPLETED' || rawResearchStatus === 'PARTIAL') &&
              !isRefreshingState && (
                <>
                  <button
                    type="button"
                    onClick={() => startResearchMutation.mutate({ forceRefresh: false })}
                    disabled={startResearchMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    Refresh Research
                  </button>
                  <button
                    type="button"
                    onClick={() => startResearchMutation.mutate({ forceRefresh: true })}
                    disabled={startResearchMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-200 bg-slate-100 border border-slate-300 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
                    title="Bypass 24h freshness cache (max 3 per company/24h)"
                  >
                    Force Refresh
                  </button>
                </>
              )}

            {rawResearchStatus === 'FAILED' && !isRefreshingState && (
              <button
                type="button"
                onClick={() => startResearchMutation.mutate({ forceRefresh: true })}
                disabled={startResearchMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 disabled:opacity-50 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {startResearchMutation.isPending ? 'Retrying...' : 'Retry Research'}
              </button>
            )}
          </div>
        </div>

        {/* Rate Limit or Execution Alert */}
        {researchError && (
          <div
            role="alert"
            className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-xs text-rose-800"
          >
            <div className="flex items-center space-x-2">
              <span className="font-bold">Notice:</span>
              <span>{researchError}</span>
            </div>
            <button
              type="button"
              onClick={() => setResearchError(null)}
              className="text-rose-600 hover:text-rose-900 font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900 rounded px-1"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Editing Inline Form */}
        {isEditing && (
          <form onSubmit={handleSaveEdit} className="space-y-4 pt-4 border-t border-slate-100">
            {editError && (
              <div
                role="alert"
                className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-800 space-y-2"
              >
                <p className="font-medium">{editError}</p>
                {duplicateId && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      navigate({
                        to: '/companies/$id',
                        params: { id: duplicateId },
                      });
                    }}
                    className="inline-flex items-center px-2 py-1 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded"
                  >
                    View Existing Company &rarr;
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Website URL</label>
                <input
                  type="url"
                  value={websiteUrlInput}
                  onChange={(e) => setWebsiteUrlInput(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Industry</label>
                <input
                  type="text"
                  value={industryInput}
                  onChange={(e) => setIndustryInput(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
                <input
                  type="text"
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Description / Notes
              </label>
              <textarea
                rows={2}
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
              />
            </div>

            <div className="flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={cancelEdit}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md shadow-sm"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Archive Confirmation Dialog */}
      {showArchiveConfirm && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
          <div className="text-xs text-amber-900">
            <span className="font-semibold">
              Confirm {company.status === 'ACTIVE' ? 'Archiving' : 'Re-activating'}:
            </span>{' '}
            {company.status === 'ACTIVE'
              ? 'Archiving hides this company from default active lists while preserving historical evidence.'
              : 'Re-activating returns this company to your active workspace list.'}
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowArchiveConfirm(false)}
              className="px-3 py-1 text-xs font-medium text-slate-600 hover:bg-amber-100 rounded"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={toggleArchiveStatus}
              disabled={updateMutation.isPending}
              className="px-3 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded"
            >
              {updateMutation.isPending ? 'Updating...' : 'Confirm'}
            </button>
          </div>
        </div>
      )}

      {/* 2. WHAT DID THE SYSTEM FIND? - Executive Summary & Key Findings */}
      <section
        aria-labelledby="research-summary-heading"
        className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"
      >
        <div className="border-b border-slate-100 pb-3">
          <h2
            id="research-summary-heading"
            className="text-sm font-semibold uppercase tracking-wider text-slate-900"
          >
            2. Executive Research Summary & Key Findings
          </h2>
        </div>

        {researchDetails?.run?.summary ? (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
              <span className="font-bold text-slate-900 block uppercase tracking-wider text-[11px]">
                Summary
              </span>
              <p className="text-slate-700 leading-relaxed">{researchDetails.run.summary}</p>
            </div>

            {researchDetails.run.keyFindings && researchDetails.run.keyFindings.length > 0 && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                <span className="font-bold text-slate-900 block uppercase tracking-wider text-[11px]">
                  Key Signals Discovered
                </span>
                <ul className="space-y-1.5 text-slate-700">
                  {researchDetails.run.keyFindings.map((finding, idx) => (
                    <li key={idx} className="flex items-start space-x-2">
                      <span className="text-slate-400 font-bold">&bull;</span>
                      <span>{finding}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-center">
            <p className="text-xs font-medium text-slate-700">No Research Findings Available</p>
            <p className="mt-1 text-xs text-slate-500">
              {rawResearchStatus === 'NOT_STARTED'
                ? 'Start company research above to generate executive research summary and key signals.'
                : 'Research run yielded no executive summary.'}
            </p>
          </div>
        )}
      </section>

      {/* 3. IS THERE AN ACTUAL OPPORTUNITY? - Discovered Openings */}
      <section
        aria-labelledby="opportunities-heading"
        className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2
            id="opportunities-heading"
            className="text-sm font-semibold uppercase tracking-wider text-slate-900"
          >
            3. Discovered Opportunities & Openings
          </h2>
          <span className="text-xs font-medium text-slate-500">
            {researchDetails?.opportunities.length ?? 0} active opportunities
          </span>
        </div>

        {researchDetails?.opportunities && researchDetails.opportunities.length > 0 ? (
          <div className="space-y-4">
            {researchDetails.opportunities.map((opp) => (
              <div
                key={opp.id}
                className="p-5 bg-slate-50 border border-slate-200 rounded-lg space-y-3 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">{opp.roleTitle}</h3>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold ${
                      opp.opportunityType === 'CONFIRMED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : opp.opportunityType === 'PROACTIVE'
                          ? 'bg-sky-100 text-sky-800 border border-sky-300'
                          : 'bg-slate-100 text-slate-700 border border-slate-300'
                    }`}
                  >
                    {opp.opportunityType}
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  {opp.roleLocation && (
                    <p>
                      <span className="font-semibold text-slate-700">Location:</span>{' '}
                      {opp.roleLocation}
                    </p>
                  )}
                  {opp.openingDiscoveredAt && (
                    <p>
                      <span className="font-semibold text-slate-700">Verified:</span>{' '}
                      {new Date(opp.openingDiscoveredAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {opp.roleDescription && (
                  <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded border border-slate-100">
                    {opp.roleDescription}
                  </p>
                )}

                {opp.openingSourceUrl && (
                  <div className="pt-1">
                    <a
                      href={opp.openingSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-h-[44px] text-xs text-slate-900 hover:underline font-semibold inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-slate-900 rounded px-1"
                    >
                      <span>View Source Opening</span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-center">
            <p className="text-xs font-medium text-slate-700">No Opportunities Detected</p>
            <p className="mt-1 text-xs text-slate-500">
              {rawResearchStatus === 'NOT_STARTED'
                ? 'Start company research to scan for active role openings or proactive opportunity fit.'
                : 'Current research run yielded no confirmed or proactive opportunities.'}
            </p>
          </div>
        )}
      </section>

      {/* 4. WHY SHOULD I BELIEVE THIS? - Evidence & Provenance */}
      <section
        aria-labelledby="evidence-heading"
        className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="space-y-0.5">
            <h2
              id="evidence-heading"
              className="text-sm font-semibold uppercase tracking-wider text-slate-900"
            >
              4. Key Evidence & Source Provenance
            </h2>
            <p className="text-xs text-slate-500">
              Four-layer evidentiary foundation: verified facts and derived analytical inferences.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {researchDetails?.evidence.length ?? 0} evidence items
          </span>
        </div>

        {researchDetails?.evidence && researchDetails.evidence.length > 0 ? (
          <div className="space-y-3">
            {researchDetails.evidence.map((ev) => {
              const isExpanded = Boolean(expandedEvidenceIds[ev.id]);
              const isFact = ev.classification === 'FACT';

              return (
                <div
                  key={ev.id}
                  className={`p-4 rounded-lg text-xs space-y-3 transition-colors ${
                    isFact
                      ? 'bg-slate-50 border border-slate-200'
                      : 'bg-sky-50/40 border border-dashed border-sky-300'
                  }`}
                >
                  {/* Compact Header (Always visible) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm break-words">
                          {ev.claim}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                            isFact
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-sky-100 text-sky-800 border border-sky-300'
                          }`}
                        >
                          {ev.classification}
                        </span>
                        {!isFact && (
                          <span className="text-[11px] text-sky-700 italic font-medium">
                            (Analytical Deduction)
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 text-[11px]">
                        <span>
                          <strong className="font-medium text-slate-600">Source:</strong>{' '}
                          {ev.sourceName || 'Company Source'}
                        </span>
                        {ev.confidence !== undefined && ev.confidence !== null && (
                          <span>
                            <strong className="font-medium text-slate-600">Confidence:</strong>{' '}
                            {typeof ev.confidence === 'number'
                              ? `${(ev.confidence * 100).toFixed(0)}%`
                              : !isNaN(Number(ev.confidence))
                                ? `${(Number(ev.confidence) * 100).toFixed(0)}%`
                                : String(ev.confidence)}
                          </span>
                        )}
                        {ev.collectedAt && (
                          <span>
                            <strong className="font-medium text-slate-600">Collected:</strong>{' '}
                            {new Date(ev.collectedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleEvidenceExpanded(ev.id)}
                      aria-expanded={isExpanded}
                      aria-controls={`evidence-detail-${ev.id}`}
                      className="min-h-[44px] px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-md shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 flex items-center justify-center self-stretch sm:self-auto shrink-0"
                    >
                      {isExpanded ? 'Hide Evidence ▲' : 'View Evidence ▼'}
                    </button>
                  </div>

                  {/* Expanded Detail Accordion Panel */}
                  {isExpanded && (
                    <div
                      id={`evidence-detail-${ev.id}`}
                      className="pt-3 border-t border-slate-200 space-y-3 bg-white p-3.5 rounded-lg border border-slate-100 shadow-xs"
                    >
                      {ev.sourceExcerpt && (
                        <div className="space-y-1.5">
                          <span className="font-bold text-slate-900 block text-[11px] uppercase tracking-wider">
                            Verified Source Excerpt:
                          </span>
                          <blockquote className="text-slate-700 italic bg-slate-50 p-3 rounded-md border border-slate-200/80 leading-relaxed text-xs break-words">
                            "{ev.sourceExcerpt}"
                          </blockquote>
                        </div>
                      )}

                      {ev.sourceUrl && (
                        <div className="pt-1">
                          <a
                            href={ev.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="min-h-[44px] text-slate-900 hover:underline font-semibold inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-slate-900 rounded px-1 text-xs"
                          >
                            <span>Open External Source Webpage</span>
                            <span aria-hidden="true">↗</span>
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-lg text-center">
            <p className="text-xs font-medium text-slate-700">No Evidence Claims Recorded</p>
            <p className="mt-1 text-xs text-slate-500">
              {rawResearchStatus === 'NOT_STARTED'
                ? 'Run research to extract verified source evidence claims.'
                : 'Current research run yielded no evidence items.'}
            </p>
          </div>
        )}
      </section>

      {/* 5. WHAT DOES THIS MEAN FOR ME? - Target Role Fit Context (Only if targetRoles exist) */}
      {hasTargetRoles && (
        <section
          aria-labelledby="target-fit-heading"
          className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4"
        >
          <div className="border-b border-slate-100 pb-3">
            <h2
              id="target-fit-heading"
              className="text-sm font-semibold uppercase tracking-wider text-slate-900"
            >
              5. Career Profile Alignment & Target Role Fit
            </h2>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
            <span className="font-bold text-slate-900 block">
              Target Roles Matched ({targetRoles.join(', ')}):
            </span>
            <p className="text-slate-700 leading-relaxed">
              Research findings for {company.name} have been evaluated against your career profile
              target roles ({targetRoles.join(', ')}).
            </p>
          </div>
        </section>
      )}

      {/* 6. CONTACT DISCOVERY & SELECTION WORKSPACE */}
      <ContactDiscoveryWorkspace companyId={company.id} companyName={company.name} />
    </div>
  );
}
