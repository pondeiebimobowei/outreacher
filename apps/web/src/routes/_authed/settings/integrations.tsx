import { useState, useRef, useEffect, useCallback } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  useIntegrations,
  useCreateIntegration,
  useTestIntegration,
  useDisableIntegration,
  useEnableIntegration,
  Integration,
} from '../../../api/integrations';
import { useSenderAccounts, SenderAccount } from '../../../api/sender-accounts';
import { Plus, Zap, AlertTriangle, Key, Users } from 'lucide-react';

export const Route = createFileRoute('/_authed/settings/integrations')({
  component: IntegrationsPage,
});

export function IntegrationsPage() {
  const {
    data: integrations,
    isLoading: loadingInts,
    error: intError,
  } = useIntegrations();
  const {
    data: senderAccounts,
    isLoading: loadingSenders,
    error: senderError,
  } = useSenderAccounts();

  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const handleOpenModal = () => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    setIsConnectModalOpen(true);
  };

  const handleCloseModal = useCallback(() => {
    setIsConnectModalOpen(false);
    setTimeout(() => {
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      } else {
        connectButtonRef.current?.focus();
      }
    }, 0);
  }, []);

  const isLoading = loadingInts;
  const error = intError;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1
            className="text-[24px] font-bold tracking-tight text-slate-900"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Integrations
          </h1>
          <p
            className="text-[14px] text-slate-500 mt-1"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Manage email delivery provider connections for campaign outreach.
          </p>
        </div>
        <button
          ref={connectButtonRef}
          onClick={handleOpenModal}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white shadow-xs transition-all hover:opacity-90 self-start sm:self-auto shrink-0"
          style={{
            background: 'var(--color-primary)',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}
        >
          <Plus size={15} />
          Connect provider
        </button>
      </header>

      {error ? (
        <div
          className="rounded-xl bg-red-50 border border-red-200 p-4"
          role="alert"
        >
          <h3
            className="text-sm font-semibold text-red-800"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Error loading integrations
          </h3>
          <div className="mt-1 text-xs text-red-700">
            <p>Please try again later.</p>
          </div>
        </div>
      ) : isLoading ? (
        <div
          className="animate-pulse space-y-4"
          aria-label="Loading integrations"
        >
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-slate-100 rounded-xl" />
          ))}
        </div>
      ) : !integrations || integrations.length === 0 ? (
        <div className="text-center rounded-xl border border-dashed border-slate-300 p-12 bg-white">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
            style={{
              background: 'var(--color-muted)',
              color: 'var(--color-muted-fg)',
            }}
          >
            <Zap size={22} strokeWidth={1.6} />
          </div>
          <h3
            className="text-[16px] font-bold text-slate-900 mb-1"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            No integrations
          </h3>
          <p
            className="text-[13.5px] text-slate-500 max-w-sm mx-auto mb-4"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Get started by connecting an email provider.
          </p>
          <button
            onClick={handleOpenModal}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-semibold text-white shadow-xs transition-opacity"
            style={{
              background: 'var(--color-primary)',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}
          >
            <Plus size={15} /> Connect provider
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => {
            const deps = senderError
              ? null
              : loadingSenders
                ? undefined
                : (senderAccounts || []).filter(
                    (s) => s.integrationId === integration.id,
                  );
            return (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                dependentSenders={deps}
              />
            );
          })}
        </div>
      )}

      {isConnectModalOpen && <ConnectModal onClose={handleCloseModal} />}
    </div>
  );
}

function IntegrationCard({
  integration,
  dependentSenders,
}: {
  integration: Integration;
  dependentSenders: SenderAccount[] | null | undefined;
}) {
  const testMutation = useTestIntegration();
  const enableMutation = useEnableIntegration();

  const [transientFeedback, setTransientFeedback] = useState<{
    message: string;
    type: 'error' | 'success';
  } | null>(null);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const disableButtonRef = useRef<HTMLButtonElement>(null);

  const getReasonMessage = (reason?: string) => {
    switch (reason) {
      case 'INVALID_CREDENTIALS':
        return 'Invalid credentials.';
      case 'PROVIDER_UNAVAILABLE':
        return 'Provider is temporarily unavailable.';
      case 'CONNECTION_FAILED':
        return 'Connection failed due to a network error.';
      default:
        return 'An unknown error occurred.';
    }
  };

  const handleTest = async () => {
    setTransientFeedback(null);
    try {
      const result = await testMutation.mutateAsync(integration.id);
      if (result.success) {
        setTransientFeedback({ message: 'Connection verified', type: 'success' });
      } else {
        setTransientFeedback({
          message: `Test failed: ${getReasonMessage(result.reason)}. Please try again later.`,
          type: 'error',
        });
      }
      setTimeout(() => setTransientFeedback(null), 5000);
    } catch {
      setTransientFeedback({
        message: 'An unexpected error occurred during testing.',
        type: 'error',
      });
      setTimeout(() => setTransientFeedback(null), 5000);
    }
  };

  const handleEnable = () => {
    setTransientFeedback(null);
    enableMutation.mutate(integration.id);
  };

  const handleOpenDisableModal = () => {
    setIsDisableModalOpen(true);
  };

  const handleCloseDisableModal = useCallback(() => {
    setIsDisableModalOpen(false);
    setTimeout(() => {
      disableButtonRef.current?.focus();
    }, 0);
  }, []);

  const isTesting = testMutation.isPending;
  const isEnabling = enableMutation.isPending;
  const isBusy = isTesting || isEnabling;

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all flex flex-col justify-between relative shadow-xs">
        <div className="p-5 flex-1">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0 pr-2">
              <h3
                className="text-[15px] font-bold text-slate-900 truncate"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {integration.name}
              </h3>
              <span className="inline-flex items-center text-[10.5px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-mono uppercase mt-1">
                {integration.provider}
              </span>
            </div>
            <StatusBadge status={integration.status} />
          </div>

          <div className="mt-4 space-y-2 pt-3 border-t border-slate-100">
            <p className="text-[12.5px] text-slate-600 flex items-center gap-1.5">
              <Key size={13} className="text-slate-400 shrink-0" />
              <span>Credential: Configured</span>
            </p>
            <p className="text-[12.5px] text-slate-600 flex items-center gap-1.5">
              <Users size={13} className="text-slate-400 shrink-0" />
              <span>
                {dependentSenders === undefined
                  ? 'Loading sender accounts...'
                  : dependentSenders === null
                    ? 'Sender count unavailable'
                    : `${dependentSenders.length} sender account${dependentSenders.length === 1 ? '' : 's'} linked`}
              </span>
            </p>
          </div>

          {transientFeedback && (
            <div
              className={`mt-3 text-xs p-2.5 rounded-lg flex items-start ${
                transientFeedback.type === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
              role="status"
              aria-live="polite"
            >
              {transientFeedback.message}
            </div>
          )}
        </div>

        <div className="bg-slate-50/70 px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-xl">
          <button
            onClick={handleTest}
            disabled={isBusy || integration.status === 'DISABLED'}
            className="text-[12.5px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            {isTesting ? 'Testing...' : 'Test connection'}
          </button>

          {integration.status === 'DISABLED' ? (
            <button
              onClick={handleEnable}
              disabled={isBusy}
              className="text-[12.5px] font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {isEnabling ? 'Enabling...' : 'Enable'}
            </button>
          ) : integration.status === 'ACTIVE' ? (
            <button
              ref={disableButtonRef}
              onClick={handleOpenDisableModal}
              disabled={isBusy || dependentSenders == null}
              title={
                dependentSenders === undefined
                  ? 'Loading dependencies...'
                  : dependentSenders === null
                    ? 'Cannot verify dependencies'
                    : undefined
              }
              className="text-[12.5px] font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Disable
            </button>
          ) : null}
        </div>
      </div>

      {isDisableModalOpen && (
        <DisableModal
          integration={integration}
          dependentCount={dependentSenders ? dependentSenders.length : 0}
          onClose={handleCloseDisableModal}
        />
      )}
    </>
  );
}

function DisableModal({
  integration,
  dependentCount,
  onClose,
}: {
  integration: Integration;
  dependentCount: number;
  onClose: () => void;
}) {
  const disableMutation = useDisableIntegration();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disableMutation.isPending) {
        onClose();
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input[type="text"]:not([disabled]), select:not([disabled])',
        ) as NodeListOf<HTMLElement>;

        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, disableMutation.isPending]);

  const handleConfirm = () => {
    disableMutation.mutate(integration.id, {
      onSuccess: () => onClose(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-slate-900/50 p-4 sm:p-0">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="disable-modal-title"
        className="relative w-full max-w-sm transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8"
      >
        <div className="bg-white px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3
                className="text-[17px] font-bold text-slate-900"
                id="disable-modal-title"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Disable Integration
              </h3>
              <div className="mt-2 text-[13px] text-slate-600 leading-relaxed">
                <p>
                  Disabling <strong>{integration.name}</strong> will pause all{' '}
                  {dependentCount} linked sender account
                  {dependentCount === 1 ? '' : 's'}. No new emails can be sent
                  through this provider until re-enabled.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 px-5 py-3.5 flex justify-end gap-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={disableMutation.isPending}
            className="px-4 py-2 text-[13px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg shadow-xs hover:bg-slate-50 transition-colors"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={disableMutation.isPending}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-red-600 rounded-lg shadow-xs hover:bg-red-700 transition-colors flex items-center"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            {disableMutation.isPending ? 'Disabling...' : 'Yes, disable'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Integration['status'] }) {
  if (status === 'ACTIVE') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
        style={{
          background: '#ECFDF5',
          color: '#065F46',
          border: '1px solid #A7F3D0',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: '#10B981' }}
        />
        Active
      </span>
    );
  }
  if (status === 'INVALID_CREDENTIALS') {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
        style={{
          background: '#FFFBEB',
          color: '#78350F',
          border: '1px solid #FDE68A',
          fontFamily: 'Plus Jakarta Sans, sans-serif',
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: '#F59E0B' }}
        />
        Action Required
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
      style={{
        background: '#F3F4F6',
        color: '#374151',
        border: '1px solid #D1D5DB',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: '#9CA3AF' }}
      />
      Disabled
    </span>
  );
}

function ConnectModal({ onClose }: { onClose: () => void }) {
  const createMutation = useCreateIntegration();
  const testMutation = useTestIntegration();

  const [name, setName] = useState('');
  const [credentialRef, setCredentialRef] = useState('');
  const [nameError, setNameError] = useState('');
  const [credError, setCredError] = useState('');

  const [globalErrorMsg, setGlobalErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingState, setProcessingState] = useState<
    'Creating...' | 'Testing...' | null
  >(null);

  const [createdIntegrationId, setCreatedIntegrationId] = useState<
    string | null
  >(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initialFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose();
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input[type="text"]:not([disabled]), select:not([disabled])',
        ) as NodeListOf<HTMLElement>;

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isProcessing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError('');
    setCredError('');
    setGlobalErrorMsg('');

    let hasError = false;

    if (!name.trim()) {
      setNameError('Connection name is required.');
      hasError = true;
    }

    const trimmedCred = credentialRef.trim();
    if (!trimmedCred) {
      setCredError('Credential reference is required.');
      hasError = true;
    } else if (!/^[A-Z0-9_]+$/.test(trimmedCred)) {
      setCredError(
        'Must be an uppercase environment variable (e.g. RESEND_API_KEY).',
      );
      hasError = true;
    }

    if (hasError) return;

    setIsProcessing(true);

    try {
      let targetId = createdIntegrationId;

      if (!targetId) {
        setProcessingState('Creating...');
        const integration = await createMutation.mutateAsync({
          name: name.trim(),
          provider: 'RESEND',
          secretReference: `env://${trimmedCred}`,
        });
        targetId = integration.id;
        setCreatedIntegrationId(integration.id);
      }

      setProcessingState('Testing...');

      try {
        const testResult = await testMutation.mutateAsync(targetId);
        if (testResult.success) {
          onClose();
        } else {
          setIsProcessing(false);
          let reasonMsg = 'Connection failed.';
          if (testResult.reason === 'INVALID_CREDENTIALS')
            reasonMsg = 'Invalid credentials provided.';
          if (testResult.reason === 'PROVIDER_UNAVAILABLE')
            reasonMsg = 'Provider is temporarily unavailable.';

          setGlobalErrorMsg(
            `Test failed: ${reasonMsg} You can test again later.`,
          );
        }
      } catch {
        setIsProcessing(false);
        setGlobalErrorMsg(
          'Network error occurred while testing. Integration was saved.',
        );
      }
    } catch {
      setGlobalErrorMsg(
        'Failed to process provider integration. Please check your inputs or try again later.',
      );
      setIsProcessing(false);
      setProcessingState(null);
    }
  };

  const isFormDisabled = isProcessing || !!createdIntegrationId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-slate-900/50 p-4 sm:p-0">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative w-full max-w-md transform overflow-hidden rounded-xl bg-white text-left shadow-xl transition-all sm:my-8"
      >
        <form onSubmit={handleSubmit} noValidate>
          <div className="bg-white px-5 pt-5 pb-4 sm:p-6">
            <h3
              className="text-[17px] font-bold text-slate-900"
              id="modal-title"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Connect Provider
            </h3>
            <p
              className="text-[13px] text-slate-500 mt-1"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              Add an email provider to send outbound campaigns.
            </p>

            {globalErrorMsg && (
              <div
                className="mt-3.5 rounded-lg bg-red-50 border border-red-200 p-3"
                role="alert"
              >
                <p className="text-xs text-red-800">{globalErrorMsg}</p>
              </div>
            )}

            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="provider"
                  className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Provider
                </label>
                <select
                  id="provider"
                  name="provider"
                  disabled
                  className="block w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 text-slate-700 outline-none opacity-80"
                >
                  <option value="RESEND">Resend</option>
                </select>
                <p className="text-[11.5px] text-slate-400 mt-1">
                  Resend is the active production delivery provider.
                </p>
              </div>

              <div>
                <label
                  htmlFor="name"
                  className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Connection Name
                </label>
                <input
                  type="text"
                  id="name"
                  ref={initialFocusRef}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError('');
                  }}
                  disabled={isFormDisabled}
                  placeholder="e.g., Resend Production"
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? 'name-error' : undefined}
                  className={`block w-full px-3.5 py-2 text-sm rounded-lg border shadow-xs outline-none ${
                    nameError
                      ? 'border-red-300 focus:ring-1 focus:ring-red-500'
                      : 'border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                  }`}
                />
                {nameError && (
                  <p className="mt-1 text-xs text-red-600" id="name-error">
                    {nameError}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="credentialRef"
                  className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Credential Environment Variable
                </label>
                <div className="relative rounded-lg shadow-xs">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="text-slate-400 text-sm font-mono">
                      env://
                    </span>
                  </div>
                  <input
                    type="text"
                    id="credentialRef"
                    value={credentialRef}
                    onChange={(e) => {
                      setCredentialRef(
                        e.target.value.replace(/^env:\/\//, ''),
                      );
                      setCredError('');
                    }}
                    disabled={isFormDisabled}
                    placeholder="RESEND_API_KEY"
                    aria-invalid={!!credError}
                    aria-describedby={
                      credError ? 'cred-error' : 'cred-description'
                    }
                    className={`block w-full pl-14 pr-3.5 py-2 text-sm rounded-lg border shadow-xs outline-none font-mono ${
                      credError
                        ? 'border-red-300 focus:ring-1 focus:ring-red-500'
                        : 'border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    }`}
                  />
                </div>
                {credError ? (
                  <p className="mt-1 text-xs text-red-600" id="cred-error">
                    {credError}
                  </p>
                ) : (
                  <p
                    className="mt-1 text-[11.5px] text-slate-400"
                    id="cred-description"
                  >
                    Provide the uppercase environment variable name storing your
                    API key. Raw secrets are never saved in the client.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-[13px] font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg shadow-xs hover:bg-slate-50 transition-colors"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {createdIntegrationId ? 'Close' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-4 py-2 text-[13px] font-semibold text-white rounded-lg shadow-xs transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{
                background: 'var(--color-primary)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {processingState}
                </span>
              ) : createdIntegrationId ? (
                'Test connection again'
              ) : (
                'Save & test connection'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
