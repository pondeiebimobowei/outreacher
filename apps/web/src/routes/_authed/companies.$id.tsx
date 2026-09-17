import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import { CompanyDto, CompanyStatus, fetchCompanyById, updateCompany } from '../../api/companies';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';

export const Route = createFileRoute('/_authed/companies/$id')({
  component: CompanyDetailRouteComponent,
});

function CompanyDetailRouteComponent() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Form State
  const [nameInput, setNameInput] = useState('');
  const [websiteUrlInput, setWebsiteUrlInput] = useState('');
  const [industryInput, setIndustryInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [linkedinUrlInput, setLinkedinUrlInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

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

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Navigation Breadcrumb */}
      <div>
        <button
          type="button"
          onClick={() => navigate({ to: '/companies' })}
          className="text-xs font-medium text-slate-500 hover:text-slate-900 inline-flex items-center space-x-1"
        >
          <span>&larr; Back to Target Companies</span>
        </button>
      </div>

      {/* Company Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{company.name}</h1>
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
              {company.websiteUrl && (
                <a
                  href={company.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-900 hover:underline font-medium inline-flex items-center"
                >
                  Visit Website &nearr;
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isEditing && (
              <button
                type="button"
                onClick={startEdit}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
              >
                Edit Details
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowArchiveConfirm(true)}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
            >
              {company.status === 'ACTIVE' ? 'Archive Company' : 'Re-activate'}
            </button>
          </div>
        </div>

        {/* Informational Research Milestone Transition Banner */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <span className="inline-block w-2 h-2 rounded-full bg-slate-900"></span>
              <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                Next Workflow Step: Company Research
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Automated research execution will be unlocked in the upcoming Research Milestone
              (UX-006).
            </p>
          </div>
          <button
            type="button"
            disabled
            className="px-3.5 py-1.5 text-xs font-medium text-slate-400 bg-slate-200 rounded-md cursor-not-allowed self-start sm:self-auto"
          >
            Research Milestone Coming Next
          </button>
        </div>
      </div>

      {/* Archive Confirmation Dialog */}
      {showArchiveConfirm && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
          <div className="text-xs text-amber-900">
            <span className="font-semibold">
              Confirm {company.status === 'ACTIVE' ? 'Archiving' : 'Re-activating'}:
            </span>{' '}
            {company.status === 'ACTIVE'
              ? 'Archiving hides this company from default active lists while preserving historical evidence and outreach records.'
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

      {/* 5 Decision-Oriented Option A Workspace Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Column (2/3 width) */}
        <div className="lg:col-span-2 space-span-y-6 space-y-6">
          {/* Section 1: Overview & Fit */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900">
                1. Company Overview & Fit Context
              </h2>
            </div>

            {isEditing ? (
              <form onSubmit={handleSaveEdit} className="space-y-4">
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Website URL (Leave blank to clear website & domain)
                  </label>
                  <input
                    type="url"
                    value={websiteUrlInput}
                    onChange={(e) => setWebsiteUrlInput(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Industry
                    </label>
                    <input
                      type="text"
                      value={industryInput}
                      onChange={(e) => setIndustryInput(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Location
                    </label>
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
                    LinkedIn URL
                  </label>
                  <input
                    type="url"
                    value={linkedinUrlInput}
                    onChange={(e) => setLinkedinUrlInput(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Description / Notes
                  </label>
                  <textarea
                    rows={3}
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2">
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
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block">Industry:</span>
                    <span className="font-medium text-slate-900">
                      {company.industry || 'Not specified'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Location:</span>
                    <span className="font-medium text-slate-900">
                      {company.location || 'Not specified'}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-xs text-slate-500 block mb-1">Description & Context:</span>
                  <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                    {company.description || 'No custom description added yet for this company.'}
                  </p>
                </div>

                {company.linkedinUrl && (
                  <div>
                    <a
                      href={company.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-slate-900 hover:underline inline-flex items-center font-medium"
                    >
                      View LinkedIn Profile &nearr;
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Opportunity Status */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-3 mb-4">
              2. Opportunity Status
            </h2>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
              <div>
                <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold bg-slate-200 text-slate-800">
                  Opportunity Status: No opportunity assessment yet
                </span>
                <p className="mt-2 text-xs text-slate-600">
                  Opportunity state assessment belongs to the downstream Research & Opportunity
                  milestones.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Recommended Contacts */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-3 mb-4">
              3. Recommended Contacts
            </h2>
            <EmptyState
              title="No Contacts Discovered Yet"
              description="Relevant company contact discovery will be enabled in the Contact Discovery milestone."
            />
          </div>
        </div>

        {/* Sidebar Column (1/3 width) */}
        <div className="space-y-6">
          {/* Section 4: Key Evidence */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-3 mb-4">
              4. Key Evidence Preview
            </h2>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center">
              <p className="text-xs font-medium text-slate-700">
                No Research Evidence Collected Yet
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Evidence collection belongs to the Research milestone.
              </p>
            </div>
          </div>

          {/* Section 5: Outreach & Campaign History */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-3 mb-4">
              5. Outreach & Campaign History
            </h2>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center">
              <p className="text-xs font-medium text-slate-700">No Outreach Activity Recorded</p>
              <p className="mt-1 text-xs text-slate-500">
                Outreach history will be derived from campaign and email send records.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
