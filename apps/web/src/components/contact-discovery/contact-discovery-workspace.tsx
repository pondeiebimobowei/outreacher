import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { EvaluatedContactDto } from '../../api/contacts';
import { AddContactModal } from './add-contact-modal';
import { ContactCard } from './contact-card';
import { ContactDetailModal } from './contact-detail-modal';
import { useContactDiscovery } from './use-contact-discovery';

interface ContactDiscoveryWorkspaceProps {
  companyId: string;
  companyName: string;
}

export function ContactDiscoveryWorkspace({
  companyId,
  companyName,
}: ContactDiscoveryWorkspaceProps) {
  const navigate = useNavigate();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [reviewContact, setReviewContact] = useState<EvaluatedContactDto | null>(null);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRelevance, setFilterRelevance] = useState<'ALL' | 'HIGH'>('ALL');
  const [filterEmailAvailable, setFilterEmailAvailable] = useState(false);
  const [filterKind, setFilterKind] = useState<'ALL' | 'PERSON' | 'ROLE_ADDRESS'>('ALL');

  const {
    contactsData,
    isLoading,
    isError,
    rateLimitError,
    ariaAnnouncement,
    isPollingActive,
    isStillRunningTimeout,
    setRateLimitError,
    refetch,
    discoverContacts,
    isDiscoverPending,
    selectContact,
    isSelectPending,
  } = useContactDiscovery(companyId);

  const rawStatus = contactsData?.status ?? 'NOT_STARTED';
  const contacts = contactsData?.contacts ?? [];
  const selectedContact = contacts.find((c) => c.isSelected);
  const hasCandidates = contacts.length > 0;

  // Search & Cumulative Filter Pipeline
  const filteredContacts = contacts.filter((candidate) => {
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const matchName = candidate.name.toLowerCase().includes(q);
      const matchTitle = (candidate.title || '').toLowerCase().includes(q);
      const matchEmail = (candidate.email || '').toLowerCase().includes(q);
      if (!matchName && !matchTitle && !matchEmail) return false;
    }
    if (filterRelevance === 'HIGH' && candidate.relevance !== 'HIGH') {
      return false;
    }
    if (filterEmailAvailable && (candidate.emailConfidence !== 'AVAILABLE' || !candidate.email)) {
      return false;
    }
    if (filterKind !== 'ALL' && candidate.contactKind !== filterKind) {
      return false;
    }
    return true;
  });

  // Sectioning: Top Recommendations (HIGH relevance) vs Additional Candidates
  const topRecommendations = filteredContacts.filter((c) => c.relevance === 'HIGH');
  const additionalCandidates = filteredContacts.filter((c) => c.relevance !== 'HIGH');

  const isFilterActive =
    Boolean(searchTerm.trim()) ||
    filterRelevance !== 'ALL' ||
    filterEmailAvailable ||
    filterKind !== 'ALL';

  const clearFilters = () => {
    setSearchTerm('');
    setFilterRelevance('ALL');
    setFilterEmailAvailable(false);
    setFilterKind('ALL');
  };

  return (
    <section
      aria-labelledby="contact-discovery-heading"
      className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6"
    >
      {/* ARIA Live region for discrete screen-reader announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {ariaAnnouncement}
      </div>

      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center space-x-3">
            <h2
              id="contact-discovery-heading"
              className="text-base font-bold tracking-tight text-slate-900 uppercase tracking-wider text-xs"
            >
              6. Contact Discovery & Selection
            </h2>
            {contactsData?.mock && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                Mock Data Provider
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Identify, evaluate relevance, and select the most appropriate person or role address at{' '}
            {companyName}.
          </p>
        </div>

        {/* Discovery Action Controls */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            + Add Contact
          </button>

          {rawStatus === 'NOT_STARTED' && !isPollingActive && (
            <button
              type="button"
              onClick={() => discoverContacts({ forceRefresh: false })}
              disabled={isDiscoverPending}
              className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {isDiscoverPending ? 'Starting...' : 'Find Relevant Contacts'}
            </button>
          )}

          {(rawStatus === 'COMPLETED' || rawStatus === 'PARTIAL' || hasCandidates) &&
            !isPollingActive && (
              <>
                <button
                  type="button"
                  onClick={() => discoverContacts({ forceRefresh: false })}
                  disabled={isDiscoverPending}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  Refresh Contacts
                </button>
                <button
                  type="button"
                  onClick={() => discoverContacts({ forceRefresh: true })}
                  disabled={isDiscoverPending}
                  className="px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-slate-200 bg-slate-100 border border-slate-300 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
                  title="Bypass 24h freshness cache (max 3 per company/24h)"
                >
                  Force Refresh
                </button>
              </>
            )}

          {(rawStatus === 'FAILED' || isError) && !isPollingActive && (
            <button
              type="button"
              onClick={() => discoverContacts({ forceRefresh: true })}
              disabled={isDiscoverPending}
              className="px-4 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 disabled:opacity-50 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {isDiscoverPending ? 'Retrying...' : 'Retry Contact Discovery'}
            </button>
          )}
        </div>
      </div>

      {/* Rate Limit Alert */}
      {rateLimitError && (
        <div
          role="alert"
          className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-xs text-rose-800"
        >
          <div className="flex items-center space-x-2">
            <span className="font-bold">Notice:</span>
            <span>{rateLimitError}</span>
          </div>
          <button
            type="button"
            onClick={() => setRateLimitError(null)}
            className="text-rose-600 hover:text-rose-900 font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900 rounded px-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* State Machine Presentations */}
      {isLoading && (
        <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-xs font-medium text-slate-600">Loading contact candidates...</p>
        </div>
      )}

      {/* State: NOT_STARTED */}
      {rawStatus === 'NOT_STARTED' && !isPollingActive && !isLoading && (
        <div className="p-8 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-3">
          <h3 className="text-sm font-bold text-slate-900">No Contact Discovery Executed Yet</h3>
          <p className="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
            Discover key decision-makers, engineering managers, talent acquisition contacts, or role
            addresses at {companyName}. Evaluates role relevance and evidence grounding without
            fabricating contact details.
          </p>
          <button
            type="button"
            onClick={() => discoverContacts({ forceRefresh: false })}
            disabled={isDiscoverPending}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {isDiscoverPending ? 'Starting...' : 'Find Relevant Contacts'}
          </button>
        </div>
      )}

      {/* State: DISCOVERING (Polling active & under 30s) */}
      {isPollingActive && !isStillRunningTimeout && (
        <div className="p-8 bg-sky-50 border border-sky-200 rounded-lg text-center space-y-3">
          <div className="inline-flex items-center space-x-2">
            <span className="w-2.5 h-2.5 bg-sky-600 rounded-full animate-ping" />
            <span className="text-xs font-bold uppercase tracking-wider text-sky-900">
              Finding Relevant Contacts at {companyName}...
            </span>
          </div>
          <p className="text-xs text-sky-800 max-w-lg mx-auto leading-relaxed">
            Scanning company background and evaluating candidate role relevance against your target
            profile...
          </p>
        </div>
      )}

      {/* State: DISCOVERY_STILL_RUNNING (30s polling timeout elapsed - NOT a failure state!) */}
      {isStillRunningTimeout && (
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 text-xs text-amber-900">
            <span className="font-bold block uppercase tracking-wider text-[11px]">
              Discovery Still Processing in Background
            </span>
            <p>
              Contact discovery is taking longer than expected and is continuing in the background.
              Results will appear automatically when finished.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-3.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 border border-amber-300 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            Check Status
          </button>
        </div>
      )}

      {/* State: CANDIDATES_FOUND / READY_FOR_SELECTION */}
      {hasCandidates && (
        <div className="space-y-6">
          {/* Contact-to-Outreach Transition Banner */}
          {selectedContact && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-900 shadow-sm">
              <div className="space-y-0.5">
                <span className="font-bold uppercase tracking-wider text-[11px] text-emerald-800 block">
                  Target Contact Selected
                </span>
                <p>
                  <span className="font-bold">{selectedContact.name}</span> (
                  {selectedContact.title || 'Role Context'}) is selected for outreach at{' '}
                  {companyName}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate({ to: '/campaigns' })}
                className="px-3.5 py-1.5 text-xs font-bold text-emerald-900 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 shrink-0"
              >
                Prepare Outreach & Campaign Context &rarr;
              </button>
            </div>
          )}

          {/* Search & Cumulative Filter Controls Bar */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <label htmlFor="contact-search-input" className="sr-only">
                  Search candidate contacts
                </label>
                <input
                  id="contact-search-input"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name, title, or email..."
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-slate-900"
                />
              </div>

              {isFilterActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 underline focus:outline-none focus:ring-2 focus:ring-slate-900 rounded px-1 self-end sm:self-auto"
                >
                  Clear Filters
                </button>
              )}
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-500 text-[11px] uppercase tracking-wider">
                Filters:
              </span>

              <button
                type="button"
                onClick={() => setFilterRelevance((prev) => (prev === 'HIGH' ? 'ALL' : 'HIGH'))}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                  filterRelevance === 'HIGH'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                High Relevance Only
              </button>

              <button
                type="button"
                onClick={() => setFilterEmailAvailable((prev) => !prev)}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                  filterEmailAvailable
                    ? 'bg-sky-100 text-sky-800 border-sky-300 font-bold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Email Available
              </button>

              <select
                aria-label="Filter by Contact Type"
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value as 'ALL' | 'PERSON' | 'ROLE_ADDRESS')}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="ALL">All Contact Types</option>
                <option value="PERSON">PERSON (Individuals)</option>
                <option value="ROLE_ADDRESS">ROLE_ADDRESS (Team Addresses)</option>
              </select>
            </div>
          </div>

          {/* Filter Zero-Match State */}
          {filteredContacts.length === 0 && isFilterActive && (
            <div className="p-8 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-3">
              <h3 className="text-sm font-bold text-slate-900">No Matching Contacts Found</h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                No candidate contacts match your current search term or active filter criteria.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                Reset Search & Filters
              </button>
            </div>
          )}

          {/* Top Recommendations Section (relevance === 'HIGH') */}
          {topRecommendations.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Top Recommendations
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    High Relevance ({topRecommendations.length})
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  Domain-evaluated high relevance contacts
                </span>
              </div>

              <div className="space-y-4">
                {topRecommendations.map((candidate) => (
                  <ContactCard
                    key={candidate.id}
                    contact={candidate}
                    onSelect={selectContact}
                    isSelectPending={isSelectPending}
                    onReview={(c) => setReviewContact(c)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Additional Candidates Section */}
          {additionalCandidates.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  {topRecommendations.length > 0 ? 'Additional Candidates' : 'Evaluated Candidates'}{' '}
                  ({additionalCandidates.length})
                </h3>
                <span className="text-[11px] text-slate-500">
                  Medium & Low relevance candidates
                </span>
              </div>

              <div className="space-y-4">
                {additionalCandidates.map((candidate) => (
                  <ContactCard
                    key={candidate.id}
                    contact={candidate}
                    onSelect={selectContact}
                    isSelectPending={isSelectPending}
                    onReview={(c) => setReviewContact(c)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* State: NO_SUITABLE_CONTACTS_FOUND */}
      {rawStatus === 'COMPLETED' && !hasCandidates && !isPollingActive && (
        <div className="p-8 bg-slate-50 border border-slate-200 rounded-lg text-center space-y-3">
          <h3 className="text-sm font-bold text-slate-900">No Suitable Contacts Identified Yet</h3>
          <p className="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
            Contact discovery completed, but no credible contact candidates were found for{' '}
            {companyName}. You can review company research findings or retry contact discovery.
          </p>
          <button
            type="button"
            onClick={() => discoverContacts({ forceRefresh: true })}
            disabled={isDiscoverPending}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {isDiscoverPending ? 'Retrying...' : 'Retry Contact Discovery'}
          </button>
        </div>
      )}

      {/* State: DISCOVERY_FAILED */}
      {rawStatus === 'FAILED' && !hasCandidates && !isPollingActive && (
        <div className="p-8 bg-rose-50 border border-rose-200 rounded-lg text-center space-y-3">
          <h3 className="text-sm font-bold text-rose-900">Contact Discovery Run Failed</h3>
          <p className="text-xs text-rose-800 max-w-lg mx-auto leading-relaxed">
            The background discovery job failed to complete. Review provider status or trigger a
            retry.
          </p>
          <button
            type="button"
            onClick={() => discoverContacts({ forceRefresh: true })}
            disabled={isDiscoverPending}
            className="px-4 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 disabled:opacity-50 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {isDiscoverPending ? 'Retrying...' : 'Retry Contact Discovery'}
          </button>
        </div>
      )}

      {/* Add Contact Modal */}
      <AddContactModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        companyId={companyId}
        companyName={companyName}
      />

      {/* Contact Review Detail Modal */}
      <ContactDetailModal
        isOpen={reviewContact !== null}
        onClose={() => setReviewContact(null)}
        contact={reviewContact}
        companyName={companyName}
        onSelect={selectContact}
        isSelectPending={isSelectPending}
      />
    </section>
  );
}
