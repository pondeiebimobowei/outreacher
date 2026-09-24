import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ApiError } from '../../api/client';
import {
  ApproveDraftInput,
  CampaignContactDetailsDto,
  CampaignContactSummaryDto,
  fetchCampaignContact,
  triggerGenerateOutreach,
  updateOutreachDraft,
  approveOutreachDraft,
  sendCampaignContact,
} from '../../api/outreach';
import { SendConfirmationModal } from './send-confirmation-modal';
import { PreDispatchHold } from './pre-dispatch-hold';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface OutreachReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  campaignContactId: string | null;
  boundContacts?: CampaignContactSummaryDto[];
  onSelectCampaignContact?: (id: string) => void;
  companyName: string;
  triggerElementRef?: React.RefObject<HTMLElement | null>;
  userId?: string;
}

export function OutreachReviewDrawer({
  isOpen,
  onClose,
  campaignContactId,
  boundContacts = [],
  onSelectCampaignContact,
  companyName,
  triggerElementRef,
  userId,
}: OutreachReviewDrawerProps) {
  // Drawer DOM container for focus trapping
  const drawerRef = useRef<HTMLDivElement | null>(null);

  // State: Hydrated Campaign Contact
  const [contactDetails, setContactDetails] =
    useState<CampaignContactDetailsDto | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // State: Form Inputs & Authoritative Concurrency Token
  const [subject, setSubject] = useState<string>('');
  const [bodyText, setBodyText] = useState<string>('');
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | undefined>(
    undefined,
  );

  // State: Autosave & Mutex Locking
  const [isAutosaving, setIsAutosaving] = useState<boolean>(false);
  const [saveStatusText, setSaveStatusText] = useState<string>('');
  const [concurrencyError, setConcurrencyError] = useState<string | null>(null);
  const pendingSaveRef = useRef<{ subject: string; bodyText: string } | null>(
    null,
  );
  const isAutosavingRef = useRef<boolean>(false);

  // State: Correlated Generation Polling
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [targetJobId, setTargetJobId] = useState<string | null>(null);
  const [generationDuration, setGenerationDuration] = useState<number>(0);
  const [isStillRunningTimeout, setIsStillRunningTimeout] =
    useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // State: Approval & Suppression
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [approvalSuccessBanner, setApprovalSuccessBanner] =
    useState<boolean>(false);
  const [suppressionError, setSuppressionError] = useState<string | null>(null);

  // State: Packet 5 Consequential Send, Hold & Polling
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isPreDispatchHoldActive, setIsPreDispatchHoldActive] =
    useState<boolean>(false);
  const [activeSendIdempotencyKey, setActiveSendIdempotencyKey] =
    useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [isPollingDispatch, setIsPollingDispatch] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // State: UI & Accessibility
  const [ariaAnnouncement, setAriaAnnouncement] = useState<string>('');
  const [isMobileEvidenceExpanded, setIsMobileEvidenceExpanded] =
    useState<boolean>(false);

  // Sequential cycling index calculation
  const currentIndex = boundContacts.findIndex(
    (c) => c.id === campaignContactId,
  );
  const hasMultipleContacts = boundContacts.length > 1;
  const canGoPrevious = currentIndex > 0;
  const canGoNext =
    currentIndex >= 0 && currentIndex < boundContacts.length - 1;

  // Hydrate contact details whenever campaignContactId changes
  const loadContactDetails = useCallback(async (id: string) => {
    setIsLoadingDetails(true);
    setFetchError(null);
    setConcurrencyError(null);
    setSuppressionError(null);
    setSendError(null);
    setApprovalSuccessBanner(false);
    setSaveStatusText('');

    try {
      const data = await fetchCampaignContact(id);
      setContactDetails(data);
      setSubject(data.currentSubject || '');
      setBodyText(data.currentBody || '');
      setExpectedUpdatedAt(data.updatedAt);
      if (data.status === 'READY') {
        setApprovalSuccessBanner(true);
      }
      if (data.status === 'SENDING') {
        setIsDispatching(true);
        setIsPollingDispatch(true);
      } else {
        setIsDispatching(false);
        setIsPollingDispatch(false);
      }
      if (data.generationJob?.status === 'COMPLETED') {
        setIsStillRunningTimeout(false);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load outreach draft.';
      setFetchError(msg);
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && campaignContactId) {
      void loadContactDetails(campaignContactId);
    } else if (!isOpen) {
      setContactDetails(null);
      setSubject('');
      setBodyText('');
      setExpectedUpdatedAt(undefined);
      setIsGenerating(false);
      setTargetJobId(null);
      setGenerationDuration(0);
      setIsStillRunningTimeout(false);
      setSaveStatusText('');
      setConcurrencyError(null);
      setSuppressionError(null);
      setApprovalSuccessBanner(false);
      setShowConfirmModal(false);
      setIsPreDispatchHoldActive(false);
      setActiveSendIdempotencyKey(null);
      setIsDispatching(false);
      setIsPollingDispatch(false);
      setSendError(null);
    }
  }, [isOpen, campaignContactId, loadContactDetails]);

  // Serialized & Coalesced Autosave on Blur
  const executeAutosave = useCallback(
    async (
      saveSubject: string,
      saveBody: string,
      concurrencyToken?: string,
    ) => {
      if (!campaignContactId) return;

      isAutosavingRef.current = true;
      setIsAutosaving(true);
      setSaveStatusText('Saving changes...');
      setConcurrencyError(null);

      try {
        const res = await updateOutreachDraft(campaignContactId, {
          subject: saveSubject.trim() ? saveSubject : undefined,
          bodyText: saveBody.trim() ? saveBody : undefined,
          expectedUpdatedAt: concurrencyToken,
        });

        // Update local authoritative timestamp
        setExpectedUpdatedAt(res.updatedAt);
        setContactDetails((prev) =>
          prev
            ? {
                ...prev,
                currentSubject: res.currentSubject,
                currentBody: res.currentBody,
                status: res.status, // Model B: resets to PENDING
                updatedAt: res.updatedAt,
              }
            : null,
        );
        setApprovalSuccessBanner(false);
        setSaveStatusText('All changes saved');
        setAriaAnnouncement('Changes saved.');
      } catch (err: unknown) {
        if (err instanceof ApiError && err.statusCode === 409) {
          setConcurrencyError(
            'A newer version of this draft was updated in another session. Your local edits have been preserved.',
          );
          setAriaAnnouncement(
            'Conflict detected: draft was updated in another session.',
          );
        } else {
          const msg =
            err instanceof Error ? err.message : 'Failed to save changes.';
          setConcurrencyError(msg);
          setAriaAnnouncement(`Autosave failed: ${msg}`);
        }
        setSaveStatusText('Save failed');
      } finally {
        isAutosavingRef.current = false;
        setIsAutosaving(false);

        // Check if another blur occurred while this save was in flight
        if (pendingSaveRef.current) {
          const next = pendingSaveRef.current;
          pendingSaveRef.current = null;
          // Recursively execute save with latest authoritative expectedUpdatedAt
          void executeAutosave(next.subject, next.bodyText, expectedUpdatedAt);
        }
      }
    },
    [campaignContactId, expectedUpdatedAt],
  );

  const handleBlur = () => {
    // Only autosave if we have a valid contact and changes aren't blank
    if (!campaignContactId) return;

    if (isAutosavingRef.current) {
      // Queue latest changes for coalesced save
      pendingSaveRef.current = { subject, bodyText };
      return;
    }

    void executeAutosave(subject, bodyText, expectedUpdatedAt);
  };

  // Correlated Generation Polling
  const handleGenerate = async () => {
    if (!campaignContactId || isAutosaving) return;

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationDuration(0);
    setIsStillRunningTimeout(false);
    setAriaAnnouncement('AI outreach draft generation initiated.');

    try {
      const res = await triggerGenerateOutreach(campaignContactId);
      setTargetJobId(res.jobId);
    } catch (err: unknown) {
      setIsGenerating(false);
      if (err instanceof ApiError && err.statusCode === 429) {
        setGenerationError(
          'AI generation limit reached (max 20 calls per user/workspace per hour).',
        );
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to initiate draft generation.';
        setGenerationError(msg);
      }
      setAriaAnnouncement('Draft generation failed.');
    }
  };

  // Polling loop correlated strictly to targetJobId
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    let durationTimer: NodeJS.Timeout | null = null;

    if (isGenerating && targetJobId && campaignContactId) {
      durationTimer = setInterval(() => {
        setGenerationDuration((prev) => {
          const next = prev + 2000;
          if (next >= 30000) {
            // Stop client polling at 30s timeout without claiming backend cancellation
            setIsStillRunningTimeout(true);
            setIsGenerating(false);
            setAriaAnnouncement(
              'Draft generation is taking longer than expected and is continuing in the background.',
            );
          }
          return next;
        });
      }, 2000);

      const poll = async () => {
        try {
          const latest = await fetchCampaignContact(campaignContactId);
          // Check if generation job matching targetJobId is present
          if (latest.generationJob?.id === targetJobId) {
            if (latest.generationJob.status === 'COMPLETED') {
              setIsGenerating(false);
              setTargetJobId(null);
              setContactDetails(latest);
              setSubject(latest.currentSubject || '');
              setBodyText(latest.currentBody || '');
              setExpectedUpdatedAt(latest.updatedAt);
              setApprovalSuccessBanner(false);
              setAriaAnnouncement(
                'Draft outreach generated. Review required before approval.',
              );
              return;
            } else if (
              latest.generationJob.status === 'FAILED' ||
              latest.generationJob.status === 'DEAD_LETTER'
            ) {
              setIsGenerating(false);
              setTargetJobId(null);
              setGenerationError(
                latest.generationJob.lastError ||
                  'Generation failed during processing.',
              );
              setAriaAnnouncement('Draft generation failed.');
              return;
            }
          }
        } catch {
          // Silent catch during transient poll
        }
      };

      timer = setInterval(poll, 2000);
    }

    return () => {
      if (timer) clearInterval(timer);
      if (durationTimer) clearInterval(durationTimer);
    };
  }, [isGenerating, targetJobId, campaignContactId]);

  // Approval Action (BL-012)
  const handleApprove = async () => {
    if (!campaignContactId || isAutosaving || isApproving) return;

    setIsApproving(true);
    setSuppressionError(null);
    setConcurrencyError(null);
    setAriaAnnouncement('Approving outreach draft...');

    try {
      const input: ApproveDraftInput = {
        expectedUpdatedAt,
      };
      const res = await approveOutreachDraft(campaignContactId, input);
      setExpectedUpdatedAt(res.updatedAt);
      setContactDetails((prev) =>
        prev
          ? {
              ...prev,
              status: 'READY',
              updatedAt: res.updatedAt,
            }
          : null,
      );
      setApprovalSuccessBanner(true);
      setAriaAnnouncement('Outreach draft approved and staged for dispatch.');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.statusCode === 409) {
        if (
          err.message.toLowerCase().includes('suppress') ||
          err.code === 'RECIPIENT_SUPPRESSED'
        ) {
          setSuppressionError('Recipient email is suppressed. Cannot approve.');
          setAriaAnnouncement(
            'Approval blocked: recipient email is suppressed.',
          );
        } else {
          setConcurrencyError(
            'Concurrent update detected; draft was modified. Approval aborted.',
          );
          setAriaAnnouncement('Approval aborted due to concurrent update.');
        }
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to approve outreach draft.';
        setSuppressionError(msg);
        setAriaAnnouncement(`Approval failed: ${msg}`);
      }
    } finally {
      setIsApproving(false);
    }
  };

  // Helper for user & workspace scoped preference key
  const getPreferenceStorageKey = useCallback(() => {
    const effectiveWorkspaceId = contactDetails?.workspaceId || 'default';
    const effectiveUserId = userId || 'current';
    return `outreacher:skip_single_send_confirmation:${effectiveWorkspaceId}:${effectiveUserId}`;
  }, [contactDetails?.workspaceId, userId]);

  const startPreDispatchHold = useCallback(() => {
    const freshKey = generateUUID();
    setActiveSendIdempotencyKey(freshKey);
    setIsPreDispatchHoldActive(true);
    setSendError(null);
    setAriaAnnouncement('Sending in 5s. You may cancel during this buffer.');
  }, []);

  const handleSendNowClick = useCallback(() => {
    if (!contactDetails || contactDetails.status !== 'READY') return;

    const key = getPreferenceStorageKey();
    const shouldSkip =
      typeof window !== 'undefined' && localStorage.getItem(key) === 'true';

    if (shouldSkip) {
      startPreDispatchHold();
    } else {
      setShowConfirmModal(true);
    }
  }, [contactDetails, getPreferenceStorageKey, startPreDispatchHold]);

  const handleConfirmModalSubmit = useCallback(
    (dontAskAgain: boolean) => {
      if (dontAskAgain && typeof window !== 'undefined') {
        const key = getPreferenceStorageKey();
        localStorage.setItem(key, 'true');
      }
      setShowConfirmModal(false);
      startPreDispatchHold();
    },
    [getPreferenceStorageKey, startPreDispatchHold],
  );

  const handleCancelSend = useCallback(() => {
    setIsPreDispatchHoldActive(false);
    setActiveSendIdempotencyKey(null);
    setAriaAnnouncement('Send cancelled. Draft remains approved.');
  }, []);

  const handleExecuteSend = useCallback(async () => {
    if (!campaignContactId || !activeSendIdempotencyKey) return;

    setIsPreDispatchHoldActive(false);
    setIsDispatching(true);
    setSendError(null);
    setAriaAnnouncement('Dispatching outreach email...');

    const keyToUse = activeSendIdempotencyKey;

    // Primary authority: immediately transition CampaignContact status to SENDING
    setContactDetails((prev) =>
      prev ? { ...prev, status: 'SENDING' } : null,
    );

    try {
      await sendCampaignContact(campaignContactId, keyToUse);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.statusCode === 409) {
        const raw = String(err.message || '').toLowerCase();
        if (raw.includes('suppress') || err.code?.includes('SUPPRESS')) {
          setSendError('Recipient email is suppressed. Cannot send.');
        } else if (
          raw.includes('state') ||
          raw.includes('campaign') ||
          raw.includes('status')
        ) {
          setSendError('This campaign cannot send from its current state.');
        } else {
          setSendError(err.message || 'Send conflict occurred.');
        }
      } else if (err instanceof ApiError && err.statusCode === 0) {
        setSendError(
          'Network error during send request. Checking server status...',
        );
      } else {
        const msg =
          err instanceof Error ? err.message : 'Failed to dispatch email.';
        setSendError(msg);
      }
    }

    setIsPollingDispatch(true);
  }, [campaignContactId, activeSendIdempotencyKey]);

  // Polling loop for delivery state (CampaignContact.status is primary authority)
  useEffect(() => {
    if (!isPollingDispatch || !campaignContactId) return;

    let pollTimer: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const poll = async () => {
      try {
        const latest = await fetchCampaignContact(campaignContactId);
        if (isCancelled) return;

        setContactDetails(latest);

        if (latest.status === 'SENT') {
          setIsPollingDispatch(false);
          setIsDispatching(false);
          setActiveSendIdempotencyKey(null);
          setAriaAnnouncement('Outreach email sent successfully.');
          return;
        }

        if (latest.status === 'FAILED') {
          setIsPollingDispatch(false);
          setIsDispatching(false);
          setActiveSendIdempotencyKey(null);
          setAriaAnnouncement('Outreach email delivery failed.');
          return;
        }
      } catch {
        // Transient network error: continue polling
      }

      if (!isCancelled) {
        pollTimer = setTimeout(poll, 2000);
      }
    };

    pollTimer = setTimeout(poll, 2000);

    return () => {
      isCancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [isPollingDispatch, campaignContactId]);

  const isOperationLocked =
    isAutosaving ||
    isApproving ||
    isGenerating ||
    isPreDispatchHoldActive ||
    isDispatching ||
    contactDetails?.status === 'SENDING';

  // Sequential cycling handler
  const handleNavigate = (direction: 'PREV' | 'NEXT') => {
    if (isOperationLocked || !onSelectCampaignContact) return;
    const targetIdx = direction === 'PREV' ? currentIndex - 1 : currentIndex + 1;
    if (targetIdx >= 0 && targetIdx < boundContacts.length) {
      const target = boundContacts[targetIdx];
      onSelectCampaignContact(target.id);
    }
  };

  // Keyboard Shortcuts & Focus Management
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes modal or cancels hold if active, else closes drawer
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showConfirmModal) {
          setShowConfirmModal(false);
          return;
        }
        if (isPreDispatchHoldActive) {
          handleCancelSend();
          return;
        }
        onClose();
        return;
      }

      // Sequential cycling shortcuts: [ and ] when not editing an active input and not locked
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (!isInputFocused && !isOperationLocked) {
        if (e.key === '[' && canGoPrevious) {
          e.preventDefault();
          handleNavigate('PREV');
        } else if (e.key === ']' && canGoNext) {
          e.preventDefault();
          handleNavigate('NEXT');
        }
      }

      // Focus trapping inside drawer
      if (e.key === 'Tab' && drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, canGoPrevious, canGoNext, currentIndex, boundContacts]);

  // Focus restoration on close
  useEffect(() => {
    if (!isOpen && triggerElementRef?.current) {
      triggerElementRef.current.focus();
    }
  }, [isOpen, triggerElementRef]);

  // Focus first actionable element when opened
  useEffect(() => {
    if (isOpen && drawerRef.current) {
      const closeBtn = drawerRef.current.querySelector<HTMLButtonElement>(
        '#outreach-drawer-close-btn',
      );
      if (closeBtn) {
        closeBtn.focus();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Live Character Counters & Boundary Validations
  const trimmedSubject = subject.trim();
  const subjectLen = trimmedSubject.length;
  const isSubjectTooShort = subjectLen > 0 && subjectLen < 3;
  const isSubjectTooLong = subjectLen > 150;
  const isSubjectAmber = subjectLen > 135 && subjectLen <= 150;
  const isSubjectValid = subjectLen >= 3 && subjectLen <= 150;

  const trimmedBody = bodyText.trim();
  const bodyLen = trimmedBody.length;
  const isBodyTooShort = bodyLen > 0 && bodyLen < 20;
  const isBodyTooLong = bodyLen > 4000;
  const isBodyAmber = bodyLen > 3600 && bodyLen <= 4000;
  const isBodyValid = bodyLen >= 20 && bodyLen <= 4000;

  const hasRecipientEmail = Boolean(contactDetails?.contact?.email);
  const isEligibleForApproval =
    isSubjectValid &&
    isBodyValid &&
    hasRecipientEmail &&
    !isAutosaving &&
    !isApproving;

  const currentStatus = contactDetails?.status ?? 'PENDING';

  return (
    <>
      {/* 1. Backdrop Scrim (Desktop and Tablet) */}
      <div
        className="fixed inset-0 bg-slate-900/20 z-40 transition-opacity backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 2. Main Slide-Over Drawer Container */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="outreach-drawer-title"
        className="fixed inset-0 z-50 bg-white flex flex-col sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[80vw] lg:w-[540px] border-l border-slate-200 shadow-2xl overflow-hidden"
      >
        {/* ARIA Live Region for Status Announcements */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {ariaAnnouncement}
        </div>

        {/* ─── HEADER ──────────────────────────────────────────────────────── */}
        <header className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between z-10 shrink-0">
          <div className="space-y-0.5 max-w-[65%]">
            <div className="flex items-center space-x-2">
              <h2
                id="outreach-drawer-title"
                className="text-sm font-bold text-slate-900 truncate"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {contactDetails?.contact?.name || 'Contact Outreach'}
              </h2>
              {/* Status Badge (CampaignContact.status is primary authority) */}
              {isGenerating ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-300 animate-pulse">
                  Generating Draft...
                </span>
              ) : currentStatus === 'SENT' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Sent
                </span>
              ) : currentStatus === 'FAILED' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300">
                  Send Failed
                </span>
              ) : currentStatus === 'SENDING' || isDispatching ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-300 animate-pulse">
                  Dispatching...
                </span>
              ) : currentStatus === 'READY' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-300">
                  Approved
                </span>
              ) : currentStatus === 'SUPPRESSED' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-300">
                  Blocked (Suppressed)
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                  Needs Review
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate">
              {contactDetails?.contact?.title
                ? `${contactDetails.contact.title} · ${companyName}`
                : companyName}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {/* Sequential Cycling Controls */}
            {hasMultipleContacts && (
              <div className="flex items-center space-x-1 border border-slate-200 rounded-md p-0.5 bg-slate-50">
                <button
                  type="button"
                  onClick={() => handleNavigate('PREV')}
                  disabled={!canGoPrevious || isOperationLocked}
                  className="px-2 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 disabled:opacity-40 rounded hover:bg-slate-200 transition-colors focus:outline-none focus:ring-1 focus:ring-slate-900"
                  title="Previous Contact ([)"
                  aria-label="Previous Contact"
                >
                  &lt;
                </button>
                <span className="text-[11px] font-mono text-slate-500 px-1">
                  {currentIndex + 1} of {boundContacts.length}
                </span>
                <button
                  type="button"
                  onClick={() => handleNavigate('NEXT')}
                  disabled={!canGoNext || isOperationLocked}
                  className="px-2 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 disabled:opacity-40 rounded hover:bg-slate-200 transition-colors focus:outline-none focus:ring-1 focus:ring-slate-900"
                  title="Next Contact (])"
                  aria-label="Next Contact"
                >
                  &gt;
                </button>
              </div>
            )}

            {/* Close Button */}
            <button
              id="outreach-drawer-close-btn"
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
              aria-label="Close outreach review drawer"
            >
              <span className="text-lg font-bold leading-none">&times;</span>
            </button>
          </div>
        </header>

        {/* ─── SCROLLABLE CONTENT BODY ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Global Fetch Loading / Error States */}
          {isLoadingDetails && (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-600 font-medium">
                Loading draft context...
              </p>
            </div>
          )}

          {fetchError && (
            <div
              role="alert"
              className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-2"
            >
              <p className="font-bold">Failed to load outreach draft</p>
              <p>{fetchError}</p>
              <button
                type="button"
                onClick={() =>
                  campaignContactId && loadContactDetails(campaignContactId)
                }
                className="font-bold text-rose-900 underline focus:outline-none"
              >
                Retry Loading
              </button>
            </div>
          )}

          {!isLoadingDetails && !fetchError && contactDetails && (
            <>
              {/* 1. MANDATORY NOTICE BANNER (AI Assisted — Review Required) */}
              <div
                role="note"
                className="bg-amber-50 border border-amber-200 p-3.5 rounded-lg text-xs text-amber-900 space-y-1 shadow-xs"
              >
                <div className="flex items-center space-x-1.5 font-bold text-amber-950">
                  <span aria-hidden="true">&#9432;</span>
                  <span>AI Assisted — Review Required</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  This message was drafted using verified evidence from your
                  research dossier. Review and edit before approving.
                </p>
              </div>

              {/* Concurrency Conflict Alert */}
              {concurrencyError && (
                <div
                  role="alert"
                  className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 space-y-1.5"
                >
                  <p className="font-bold">Concurrency Notice</p>
                  <p>{concurrencyError}</p>
                  <button
                    type="button"
                    onClick={() =>
                      campaignContactId && loadContactDetails(campaignContactId)
                    }
                    className="text-[11px] font-bold text-amber-950 underline"
                  >
                    Reload Server Version
                  </button>
                </div>
              )}

              {/* Suppression Conflict Alert */}
              {suppressionError && (
                <div
                  role="alert"
                  className="p-3.5 bg-rose-50 border border-rose-300 rounded-lg text-xs text-rose-900 space-y-1"
                >
                  <p className="font-bold">Suppression Warning</p>
                  <p>{suppressionError}</p>
                </div>
              )}

              {/* Approval Success Confirmation Banner */}
              {approvalSuccessBanner &&
                currentStatus === 'READY' &&
                !isPreDispatchHoldActive &&
                !isDispatching && (
                  <div
                    role="status"
                    className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-emerald-700">&#10003;</span>
                      <span>Draft approved and staged for dispatch.</span>
                    </div>
                  </div>
                )}

              {/* Send Dispatch Error Alert */}
              {sendError && (
                <div
                  role="alert"
                  className="p-3.5 bg-rose-50 border border-rose-300 rounded-lg text-xs text-rose-900 space-y-1"
                >
                  <p className="font-bold">Send Dispatch Failed</p>
                  <p>{sendError}</p>
                </div>
              )}

              {/* Terminal SENT Confirmation Banner */}
              {currentStatus === 'SENT' && (
                <div
                  role="status"
                  className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-lg text-xs text-emerald-900 space-y-1"
                >
                  <div className="flex items-center space-x-1.5 font-bold text-emerald-950">
                    <span>&#10003;</span>
                    <span>Outreach Email Sent</span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    Dispatched successfully
                    {contactDetails.latestEmailSend?.sentAt
                      ? ` at ${new Date(
                          contactDetails.latestEmailSend.sentAt,
                        ).toLocaleTimeString()}`
                      : ''}
                    .
                  </p>
                </div>
              )}

              {/* Terminal FAILED Alert Banner */}
              {currentStatus === 'FAILED' && (
                <div
                  role="alert"
                  className="p-3.5 bg-rose-50 border border-rose-300 rounded-lg text-xs text-rose-900 space-y-1"
                >
                  <div className="flex items-center space-x-1.5 font-bold text-rose-950">
                    <span>&#9888;</span>
                    <span>Outreach Dispatch Failed</span>
                  </div>
                  <p className="text-[11px] text-rose-800">
                    {contactDetails.latestEmailSend?.errorMessage ||
                      'Delivery provider reported a terminal dispatch failure.'}
                  </p>
                </div>
              )}

              {/* 2. EVIDENTIARY BASIS & OUTREACH REASON CARD */}
              <section
                aria-labelledby="evidentiary-basis-heading"
                className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3
                    id="evidentiary-basis-heading"
                    className="text-xs font-bold uppercase tracking-wider text-slate-900"
                  >
                    Outreach Context & Evidence
                  </h3>
                  {contactDetails.selectedOpportunity && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        contactDetails.selectedOpportunity.opportunityType ===
                        'CONFIRMED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-sky-100 text-sky-800 border border-sky-300'
                      }`}
                    >
                      {contactDetails.selectedOpportunity.opportunityType}:{' '}
                      {contactDetails.selectedOpportunity.roleTitle}
                    </span>
                  )}
                </div>

                {contactDetails.outreachReason && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Deterministic Outreach Reason:
                    </span>
                    <p className="text-xs text-slate-800 bg-white p-2.5 rounded border border-slate-200 leading-relaxed font-medium">
                      "{contactDetails.outreachReason}"
                    </p>
                  </div>
                )}

                {/* Evidence Claims Accordion (collapsible on mobile) */}
                {contactDetails.evidence && contactDetails.evidence.length > 0 && (
                  <div className="space-y-2 pt-1 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Dossier Citations ({contactDetails.evidence.length})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setIsMobileEvidenceExpanded((prev) => !prev)
                        }
                        className="text-[11px] font-bold text-slate-700 hover:text-slate-900 focus:outline-none"
                      >
                        {isMobileEvidenceExpanded ? 'Collapse ▲' : 'Expand ▼'}
                      </button>
                    </div>

                    {isMobileEvidenceExpanded && (
                      <div className="space-y-2 pt-1">
                        {contactDetails.evidence.map((ev) => (
                          <div
                            key={ev.id}
                            className="bg-white p-2.5 rounded border border-slate-200 text-xs space-y-1"
                          >
                            <div className="flex items-center space-x-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                  ev.classification === 'FACT'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}
                              >
                                {ev.classification}
                              </span>
                              <span className="font-semibold text-slate-900 truncate">
                                {ev.sourceName || 'Dossier Source'}
                              </span>
                            </div>
                            <p className="text-slate-700 text-[11px] leading-relaxed">
                              {ev.claim}
                            </p>
                            {ev.sourceUrl && (
                              <a
                                href={ev.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-slate-600 hover:underline font-semibold inline-flex items-center gap-0.5"
                              >
                                <span>Source link</span>
                                <span aria-hidden="true">&#8599;</span>
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* 3. ASYNCHRONOUS GENERATION & PULSE SKELETON */}
              {isGenerating && (
                <div
                  role="status"
                  className="p-6 bg-sky-50 border border-sky-200 rounded-lg text-center space-y-3"
                >
                  <div className="inline-flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 bg-sky-600 rounded-full animate-ping" />
                    <span className="text-xs font-bold uppercase tracking-wider text-sky-900">
                      Evaluating Evidence & Drafting Message...
                    </span>
                  </div>
                  <p className="text-xs text-sky-800 max-w-sm mx-auto leading-relaxed">
                    AI is reasoning over verified company dossier claims and
                    formatting outreach angle.
                    {generationDuration > 0 && (
                      <span className="block text-[11px] text-sky-700 font-mono mt-1">
                        Elapsed: {Math.round(generationDuration / 1000)}s
                      </span>
                    )}
                  </p>
                  <div className="space-y-2 pt-2">
                    <div className="h-4 bg-sky-200/60 rounded animate-pulse w-3/4 mx-auto" />
                    <div className="h-16 bg-sky-200/60 rounded animate-pulse w-full" />
                  </div>
                </div>
              )}

              {/* Post-Timeout State (>30s) */}
              {isStillRunningTimeout && !isGenerating && (
                <div
                  role="alert"
                  className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900"
                >
                  <div className="space-y-1">
                    <span className="font-bold uppercase tracking-wider text-[11px] block">
                      Generation Still Processing in Background
                    </span>
                    <p>
                      Draft generation is taking longer than expected and is
                      continuing in the background.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      campaignContactId && loadContactDetails(campaignContactId)
                    }
                    className="px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 border border-amber-300 rounded-md transition-colors shrink-0"
                  >
                    Check Status
                  </button>
                </div>
              )}

              {/* Generation Error Alert */}
              {generationError && (
                <div
                  role="alert"
                  className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-1"
                >
                  <p className="font-bold">Generation Error</p>
                  <p>{generationError}</p>
                </div>
              )}

              {/* 4. MESSAGE EDITOR (Subject & Body) */}
              {!isGenerating && (
                <section
                  aria-labelledby="message-editor-heading"
                  className="space-y-4"
                >
                  <h3 id="message-editor-heading" className="sr-only">
                    Outreach Message Editor
                  </h3>

                  {/* Subject Input Field */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="outreach-subject-input"
                        className="text-xs font-bold uppercase tracking-wider text-slate-700"
                      >
                        Subject (3–150 chars)
                      </label>
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          isSubjectTooLong || isSubjectTooShort
                            ? 'text-rose-600'
                            : isSubjectAmber
                              ? 'text-amber-600'
                              : 'text-slate-400'
                        }`}
                      >
                        {subjectLen} / 150
                      </span>
                    </div>
                    <input
                      id="outreach-subject-input"
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      onBlur={handleBlur}
                      disabled={isOperationLocked || currentStatus !== 'PENDING'}
                      placeholder="e.g. Acme platform scaling & lead architect role"
                      className={`w-full px-3 py-2 text-base sm:text-xs rounded-md border shadow-xs transition-colors focus:outline-none focus:ring-2 ${
                        isSubjectTooLong || isSubjectTooShort
                          ? 'border-rose-400 focus:ring-rose-500 bg-rose-50/20'
                          : isSubjectAmber
                            ? 'border-amber-400 focus:ring-amber-500'
                            : 'border-slate-300 focus:ring-slate-900 bg-white'
                      }`}
                    />
                    {isSubjectTooShort && (
                      <p className="text-[11px] text-rose-600 font-medium">
                        Subject must be at least 3 characters.
                      </p>
                    )}
                    {isSubjectTooLong && (
                      <p className="text-[11px] text-rose-600 font-medium">
                        Subject must not exceed 150 characters.
                      </p>
                    )}
                  </div>

                  {/* Body Textarea Field */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="outreach-body-textarea"
                        className="text-xs font-bold uppercase tracking-wider text-slate-700"
                      >
                        Body Text (20–4000 chars)
                      </label>
                      <span
                        className={`text-[11px] font-mono font-semibold ${
                          isBodyTooLong || isBodyTooShort
                            ? 'text-rose-600'
                            : isBodyAmber
                              ? 'text-amber-600'
                              : 'text-slate-400'
                        }`}
                      >
                        {bodyLen} / 4000
                      </span>
                    </div>
                    <textarea
                      id="outreach-body-textarea"
                      rows={8}
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                      onBlur={handleBlur}
                      disabled={isOperationLocked || currentStatus !== 'PENDING'}
                      placeholder="Hi Sarah,\n\nI noticed Acme is scaling its distributed architecture..."
                      className={`w-full p-3 text-base sm:text-xs rounded-md border shadow-xs transition-colors leading-relaxed focus:outline-none focus:ring-2 ${
                        isBodyTooLong || isBodyTooShort
                          ? 'border-rose-400 focus:ring-rose-500 bg-rose-50/20'
                          : isBodyAmber
                            ? 'border-amber-400 focus:ring-amber-500'
                            : 'border-slate-300 focus:ring-slate-900 bg-white'
                      }`}
                    />
                    {isBodyTooShort && (
                      <p className="text-[11px] text-rose-600 font-medium">
                        Body text must be at least 20 characters.
                      </p>
                    )}
                    {isBodyTooLong && (
                      <p className="text-[11px] text-rose-600 font-medium">
                        Body text must not exceed 4000 characters.
                      </p>
                    )}
                  </div>

                  {/* Subtle Save Status Indicator */}
                  {saveStatusText && (
                    <div className="flex items-center justify-end space-x-1.5 text-[11px] text-slate-400 font-medium">
                      {isAutosaving && (
                        <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
                      )}
                      <span>{saveStatusText}</span>
                    </div>
                  )}

                  {!hasRecipientEmail && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200">
                      <strong>Deliverability Notice:</strong> This contact has no
                      email address on record. An email must be provided before
                      approval can be granted.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        {/* ─── FOOTER ACTIONS (Sticky on Mobile) ────────────────────────────── */}
        <footer className="sticky bottom-0 bg-white border-t border-slate-200 p-4 shadow-lg flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 z-10 shrink-0">
          {isPreDispatchHoldActive ? (
            <PreDispatchHold
              durationMs={5000}
              contactName={contactDetails?.contact?.name}
              onCancel={handleCancelSend}
              onComplete={handleExecuteSend}
            />
          ) : (
            <>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isOperationLocked || currentStatus !== 'PENDING'}
                  className="min-h-[48px] sm:min-h-[44px] px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 inline-flex items-center justify-center"
                >
                  {subject || bodyText ? 'Regenerate Draft' : 'Generate Draft'}
                </button>
              </div>

              <div className="flex items-center space-x-2">
                {currentStatus === 'PENDING' && (
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={!isEligibleForApproval}
                    className={`min-h-[48px] sm:min-h-[44px] px-5 py-2 text-xs font-bold rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900 inline-flex items-center justify-center ${
                      isEligibleForApproval
                        ? 'bg-slate-900 hover:bg-slate-800 text-white'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                    style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                  >
                    {isApproving ? 'Approving...' : 'Approve Draft'}
                  </button>
                )}

                {currentStatus === 'READY' && (
                  <button
                    type="button"
                    onClick={handleSendNowClick}
                    disabled={isOperationLocked}
                    className="min-h-[48px] sm:min-h-[44px] px-5 py-2 text-xs font-bold rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-600 inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                  >
                    Send Now
                  </button>
                )}

                {(currentStatus === 'SENDING' || isDispatching) && (
                  <button
                    type="button"
                    disabled
                    className="min-h-[48px] sm:min-h-[44px] px-5 py-2 text-xs font-bold rounded-md shadow-sm inline-flex items-center justify-center bg-sky-600 text-white cursor-not-allowed space-x-1.5 opacity-90"
                  >
                    <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Dispatching...</span>
                  </button>
                )}

                {currentStatus === 'SENT' && (
                  <span className="min-h-[48px] sm:min-h-[44px] px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md inline-flex items-center justify-center">
                    Sent &#10003;
                  </span>
                )}

                {currentStatus === 'FAILED' && (
                  <span className="min-h-[48px] sm:min-h-[44px] px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-md inline-flex items-center justify-center">
                    Send Failed
                  </span>
                )}
              </div>
            </>
          )}
        </footer>
      </div>

      {/* Send Confirmation Modal */}
      {contactDetails && (
        <SendConfirmationModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmModalSubmit}
          contactName={contactDetails.contact?.name || 'Contact'}
          contactTitle={contactDetails.contact?.title}
          companyName={companyName}
          recipientEmail={contactDetails.contact?.email || ''}
          subject={subject}
          bodyPreview={bodyText}
        />
      )}
    </>
  );
}
