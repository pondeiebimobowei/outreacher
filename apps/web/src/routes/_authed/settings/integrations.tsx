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

export const Route = createFileRoute('/_authed/settings/integrations')({
  component: IntegrationsPage,
});

export function IntegrationsPage() {
  const { data: integrations, isLoading: loadingInts, error: intError } = useIntegrations();
  const { data: senderAccounts, error: senderError } = useSenderAccounts();
  
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Integrations</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage integrations with email providers to send outreach campaigns.
          </p>
        </div>
        <button
          ref={connectButtonRef}
          onClick={handleOpenModal}
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
        >
          Connect provider
        </button>
      </header>

      {error ? (
        <div className="rounded-md bg-red-50 p-4" role="alert">
          <h3 className="text-sm font-medium text-red-800">Error loading integrations</h3>
          <div className="mt-2 text-sm text-red-700">
            <p>Please try again later.</p>
          </div>
        </div>
      ) : isLoading ? (
        <div className="animate-pulse space-y-4" aria-label="Loading integrations">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-slate-100 rounded-lg"></div>
          ))}
        </div>
      ) : !integrations || integrations.length === 0 ? (
        <div className="text-center rounded-lg border-2 border-dashed border-slate-300 p-12">
          <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h3 className="mt-2 text-sm font-semibold text-slate-900">No integrations</h3>
          <p className="mt-1 text-sm text-slate-500">Get started by connecting an email provider.</p>
          <div className="mt-6">
            <button
              onClick={handleOpenModal}
              className="inline-flex items-center justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-xs ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
            >
              Connect provider
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => {
            const deps = senderError ? null : (senderAccounts || []).filter(s => s.integrationId === integration.id);
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

      {isConnectModalOpen && (
        <ConnectModal onClose={handleCloseModal} />
      )}
    </div>
  );
}

function IntegrationCard({ 
  integration, 
  dependentSenders,
}: { 
  integration: Integration; 
  dependentSenders: SenderAccount[] | null;
}) {
  const testMutation = useTestIntegration();
  const enableMutation = useEnableIntegration();
  
  const [transientFeedback, setTransientFeedback] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);

  const getReasonMessage = (reason?: string) => {
    switch (reason) {
      case 'INVALID_CREDENTIALS': return 'Invalid credentials.';
      case 'PROVIDER_UNAVAILABLE': return 'Provider is temporarily unavailable.';
      case 'CONNECTION_FAILED': return 'Connection failed due to a network error.';
      default: return 'An unknown error occurred.';
    }
  };

  const handleTest = async () => {
    setTransientFeedback(null);
    try {
      const result = await testMutation.mutateAsync(integration.id);
      if (result.success) {
        setTransientFeedback({ message: 'Connection verified', type: 'success' });
      } else {
        setTransientFeedback({ message: `Test failed: ${getReasonMessage(result.reason)}. Please try again later.`, type: 'error' });
      }
      setTimeout(() => setTransientFeedback(null), 5000);
    } catch (e) {
      setTransientFeedback({ message: 'An unexpected error occurred during testing.', type: 'error' });
      setTimeout(() => setTransientFeedback(null), 5000);
    }
  };

  const handleEnable = () => {
    setTransientFeedback(null);
    enableMutation.mutate(integration.id);
  };

  const isTesting = testMutation.isPending;
  const isEnabling = enableMutation.isPending;
  const isBusy = isTesting || isEnabling;

  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm flex flex-col relative">
        <div className="p-5 flex-1">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900 truncate pr-4">{integration.name}</h3>
              <p className="text-sm text-slate-500 capitalize mt-0.5">{integration.provider.toLowerCase()}</p>
            </div>
            <StatusBadge status={integration.status} />
          </div>
          
          <div className="mt-4 space-y-2">
            <p className="text-sm text-slate-600 flex items-center">
              <svg className="mr-1.5 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Credential: Configured
            </p>
            <p className="text-sm text-slate-600 flex items-center">
              <svg className="mr-1.5 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {dependentSenders === null 
                ? 'Sender count unavailable' 
                : `${dependentSenders.length} sender account${dependentSenders.length === 1 ? '' : 's'} linked`}
            </p>
          </div>

          {transientFeedback && (
            <div 
              className={`mt-4 text-sm p-2.5 rounded-md flex items-start ${
                transientFeedback.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
              }`}
              role="status"
              aria-live="polite"
            >
              {transientFeedback.message}
            </div>
          )}
        </div>
        
        <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex items-center gap-3 rounded-b-lg">
          <button
            onClick={handleTest}
            disabled={isBusy || integration.status === 'DISABLED'}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTesting ? 'Testing...' : 'Test connection'}
          </button>
          
          {integration.status !== 'INVALID_CREDENTIALS' && (
            <span className="text-slate-300" aria-hidden="true">|</span>
          )}

          {integration.status === 'DISABLED' ? (
            <button
              onClick={handleEnable}
              disabled={isBusy}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEnabling ? 'Enabling...' : 'Enable'}
            </button>
          ) : integration.status === 'ACTIVE' ? (
            <button
              onClick={() => setIsDisableModalOpen(true)}
              disabled={isBusy}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Disable
            </button>
          ) : null /* INVALID_CREDENTIALS intentionally has no secondary action to avoid duplicate creates */}
        </div>
      </div>

      {isDisableModalOpen && (
        <DisableConfirmModal
          integration={integration}
          dependentCount={dependentSenders?.length ?? 0}
          onClose={() => setIsDisableModalOpen(false)}
        />
      )}
    </>
  );
}

function DisableConfirmModal({ 
  integration, 
  dependentCount,
  onClose 
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
          'a[href], button:not([disabled]), textarea:not([disabled]), input[type="text"]:not([disabled]), select:not([disabled])'
        ) as NodeListOf<HTMLElement>;
        
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          last.focus(); e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus(); e.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, disableMutation.isPending]);

  const handleConfirm = () => {
    disableMutation.mutate(integration.id, {
      onSuccess: () => onClose()
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
        <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
          <div className="sm:flex sm:items-start">
            <div className="mx-auto flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
              <h3 className="text-lg font-semibold leading-6 text-slate-900" id="disable-modal-title">
                Disable Integration
              </h3>
              <div className="mt-2">
                <p className="text-sm text-slate-500">
                  This integration is currently used by <strong>{dependentCount} sender account{dependentCount === 1 ? '' : 's'}</strong>. 
                  Disabling it will suspend sending for these accounts and any active campaigns using them. Are you sure you want to disable it?
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-slate-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
          <button
            type="button"
            autoFocus
            onClick={handleConfirm}
            disabled={disableMutation.isPending}
            className="inline-flex w-full justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-70 sm:ml-3 sm:w-auto"
          >
            {disableMutation.isPending ? 'Disabling...' : 'Yes, disable'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={disableMutation.isPending}
            className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 sm:mt-0 sm:w-auto"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Integration['status'] }) {
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
        Active
      </span>
    );
  }
  if (status === 'INVALID_CREDENTIALS') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
        Action Required
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
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
  const [processingState, setProcessingState] = useState<'Creating...' | 'Testing...' | null>(null);
  
  const [createdIntegrationId, setCreatedIntegrationId] = useState<string | null>(null);

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
          'a[href], button:not([disabled]), textarea:not([disabled]), input[type="text"]:not([disabled]), select:not([disabled])'
        ) as NodeListOf<HTMLElement>;
        
        if (focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          lastElement.focus(); e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          firstElement.focus(); e.preventDefault();
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
      setCredError('Must be an uppercase environment variable (e.g. RESEND_API_KEY).');
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
          onClose(); // Success! Close modal.
        } else {
          setIsProcessing(false);
          let reasonMsg = 'Connection failed.';
          if (testResult.reason === 'INVALID_CREDENTIALS') reasonMsg = 'Invalid credentials provided.';
          if (testResult.reason === 'PROVIDER_UNAVAILABLE') reasonMsg = 'Provider is temporarily unavailable.';
          
          setGlobalErrorMsg(`Test failed: ${reasonMsg} You can test again later.`);
        }
      } catch (testErr) {
        setIsProcessing(false);
        setGlobalErrorMsg('Network error occurred while testing. Integration was saved.');
      }
    } catch (err: any) {
      setGlobalErrorMsg('Failed to process provider integration. Please check your inputs or try again later.');
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
          <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 w-full sm:mt-0 sm:text-left">
                <h3 className="text-lg font-semibold leading-6 text-slate-900" id="modal-title">
                  Connect Provider
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Add an email provider to send outbound campaigns.
                </p>

                {globalErrorMsg && (
                  <div className="mt-4 rounded-md bg-red-50 p-3" role="alert">
                    <p className="text-sm text-red-800">{globalErrorMsg}</p>
                  </div>
                )}

                <div className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="provider" className="block text-sm font-medium leading-6 text-slate-900">
                      Provider
                    </label>
                    <select
                      id="provider"
                      name="provider"
                      disabled
                      className="mt-2 block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-slate-900 ring-1 ring-inset ring-slate-300 bg-slate-50 focus:ring-2 focus:ring-slate-900 sm:text-sm sm:leading-6 disabled:opacity-70"
                    >
                      <option value="RESEND">Resend</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="name" className="block text-sm font-medium leading-6 text-slate-900">
                      Connection Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      ref={initialFocusRef}
                      value={name}
                      onChange={(e) => { setName(e.target.value); setNameError(''); }}
                      disabled={isFormDisabled}
                      placeholder="e.g., Resend Production"
                      aria-invalid={!!nameError}
                      aria-describedby={nameError ? "name-error" : undefined}
                      className={`mt-2 block w-full rounded-md border-0 py-1.5 text-slate-900 shadow-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6 disabled:opacity-50 ${
                        nameError ? 'ring-red-300 focus:ring-red-500' : 'ring-slate-300 focus:ring-slate-900'
                      }`}
                    />
                    {nameError && (
                      <p className="mt-1.5 text-xs text-red-600" id="name-error">
                        {nameError}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="credentialRef" className="block text-sm font-medium leading-6 text-slate-900">
                      Credential Environment Variable
                    </label>
                    <div className="relative mt-2 rounded-md shadow-sm">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <span className="text-slate-500 sm:text-sm">env://</span>
                      </div>
                      <input
                        type="text"
                        id="credentialRef"
                        value={credentialRef}
                        onChange={(e) => {
                          setCredentialRef(e.target.value.replace(/^env:\/\//, ''));
                          setCredError('');
                        }}
                        disabled={isFormDisabled}
                        placeholder="RESEND_API_KEY"
                        aria-invalid={!!credError}
                        aria-describedby={credError ? "cred-error" : "cred-description"}
                        className={`block w-full rounded-md border-0 py-1.5 pl-14 text-slate-900 ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset sm:text-sm sm:leading-6 disabled:opacity-50 ${
                          credError ? 'ring-red-300 focus:ring-red-500' : 'ring-slate-300 focus:ring-slate-900'
                        }`}
                      />
                    </div>
                    {credError ? (
                      <p className="mt-1.5 text-xs text-red-600" id="cred-error">
                        {credError}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-slate-500" id="cred-description">
                        Provide the name of the environment variable storing your API key. Raw secrets are never saved.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
            <button
              type="submit"
              disabled={isProcessing}
              className="inline-flex w-full justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-70 sm:ml-3 sm:w-auto focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {processingState}
                </span>
              ) : createdIntegrationId ? (
                'Test connection again'
              ) : (
                'Save & test connection'
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 sm:mt-0 sm:w-auto focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            >
              {createdIntegrationId ? 'Close' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
