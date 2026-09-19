import { createFileRoute } from '@tanstack/react-router';
import { useState, useRef, useEffect } from 'react';
import { useSenderAccounts, useCreateSenderAccount, useUpdateSenderAccount, SenderAccount } from '../../../api/sender-accounts';
import { useIntegrations, Integration } from '../../../api/integrations';
import { ApiError } from '../../../api/client';
import { Modal } from '../../../components/ui/Modal';

export const Route = createFileRoute('/_authed/settings/senders')({
  component: SenderAccountsPage,
});

function getEffectiveReadiness(sender: SenderAccount, integration?: Integration, isIntegrationsLoading?: boolean, isIntegrationsError?: boolean) {
  if (sender.status === 'PAUSED') return { state: 'PAUSED', label: 'Paused', color: 'text-slate-500' };
  if (sender.status === 'DISABLED') return { state: 'DISCONNECTED', label: 'Disconnected', color: 'text-slate-500' };

  if (isIntegrationsLoading) return { state: 'LOADING', label: 'Loading readiness...', color: 'text-slate-400' };
  if (isIntegrationsError) return { state: 'CANNOT_DETERMINE_READINESS', label: 'Cannot determine readiness', color: 'text-slate-400' };

  if (!integration) return { state: 'CANNOT_DETERMINE_READINESS', label: 'Cannot determine readiness', color: 'text-slate-400' };

  if (integration.status === 'ACTIVE') return { state: 'READY', label: 'Ready', color: 'text-emerald-600' };
  if (integration.status === 'INVALID_CREDENTIALS') return { state: 'NEEDS_ATTENTION', label: 'Needs attention', color: 'text-amber-600' };
  if (integration.status === 'DISABLED') return { state: 'UNAVAILABLE', label: 'Unavailable', color: 'text-red-600' };

  return { state: 'UNKNOWN', label: 'Unknown', color: 'text-slate-500' };
}

function SenderAccountsPage() {
  const { data: senders, isLoading: isSendersLoading, error: sendersError } = useSenderAccounts();
  const { data: integrations, isLoading: isIntegrationsLoading, isError: isIntegrationsError } = useIntegrations();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleOpenAddModal = () => setIsAddModalOpen(true);
  const handleCloseAddModal = () => setIsAddModalOpen(false);

  if (isSendersLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <svg className="animate-spin h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
      </div>
    );
  }

  if (sendersError) {
    return (
      <div className="p-4 rounded-md bg-red-50 text-red-800 text-sm">
        Failed to load sender accounts.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Sender Accounts</h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage the email accounts you use to send campaigns.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add sender
        </button>
      </header>

      {isIntegrationsError && (
        <div className="rounded-md bg-slate-50 p-4 border border-slate-200">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-slate-800">Integration state unavailable</h3>
              <div className="mt-2 text-sm text-slate-600">
                <p>We could not load your integration connections. The effective readiness of active sender accounts cannot be determined right now, but your historical sender records are below.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {senders?.length === 0 ? (
        <div className="text-center rounded-lg border-2 border-dashed border-slate-300 p-12">
          <svg className="mx-auto h-8 w-8 text-slate-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h3 className="text-sm font-semibold text-slate-900">No sender accounts</h3>
          <p className="mt-1 text-sm text-slate-500">
            Get started by adding a sender account based on an existing integration.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {senders?.map((sender) => {
            const integration = integrations?.find((i) => i.id === sender.integrationId);
            const readiness = getEffectiveReadiness(sender, integration, isIntegrationsLoading, isIntegrationsError);

            return (
              <SenderAccountCard 
                key={sender.id} 
                sender={sender} 
                integration={integration}
                readiness={readiness}
                isIntegrationsError={isIntegrationsError}
              />
            );
          })}
        </div>
      )}

      {isAddModalOpen && (
        <AddSenderModal 
          integrations={integrations || []}
          isLoading={isIntegrationsLoading}
          isError={isIntegrationsError}
          onClose={handleCloseAddModal} 
        />
      )}
    </div>
  );
}

function SenderAccountCard({ sender, integration, readiness, isIntegrationsError }: { sender: SenderAccount, integration?: Integration, readiness: ReturnType<typeof getEffectiveReadiness>, isIntegrationsError: boolean }) {
  const updateMutation = useUpdateSenderAccount();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const handleStatusChange = (newStatus: 'ACTIVE' | 'PAUSED') => {
    setMutationError(null);
    updateMutation.mutate(
      { id: sender.id, data: { status: newStatus } },
      {
        onError: () => {
          setMutationError(`Couldn't ${newStatus === 'PAUSED' ? 'pause' : 'resume'} this sender.`);
        }
      }
    );
  };

  const handleReconnect = () => {
    setMutationError(null);
    updateMutation.mutate(
      { id: sender.id, data: { status: 'ACTIVE' } },
      {
        onError: () => {
          setMutationError(`Couldn't reconnect this sender.`);
        }
      }
    );
  };

  const providerLabel = isIntegrationsError 
    ? 'Integration information unavailable' 
    : (integration?.name || 'Unknown Provider');

  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm flex flex-col">
        <div className="p-4 flex-1">
          <div className="flex justify-between items-start">
            <div className="truncate pr-2">
              <h3 className="text-sm font-semibold text-slate-900 truncate">{sender.fromName}</h3>
              <p className="text-sm text-slate-500 truncate">{sender.fromEmail}</p>
            </div>
            {sender.status === 'ACTIVE' && readiness.state === 'READY' && (
              <svg className="h-5 w-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {sender.status === 'ACTIVE' && readiness.state === 'NEEDS_ATTENTION' && (
              <svg className="h-5 w-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            {sender.status === 'ACTIVE' && (readiness.state === 'UNAVAILABLE' || readiness.state === 'CANNOT_DETERMINE_READINESS') && (
              <svg className="h-5 w-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {sender.status === 'PAUSED' && (
              <svg className="h-5 w-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
              </svg>
            )}
            {sender.status === 'DISABLED' && (
              <svg className="h-5 w-5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          
          {sender.replyTo && sender.replyTo !== sender.fromEmail && (
            <div className="mt-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Replies</p>
              <p className="text-sm text-slate-600 truncate">{sender.replyTo}</p>
            </div>
          )}

          {sender.dailyLimit && (
            <div className="mt-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Daily Limit</p>
              <p className="text-sm text-slate-600">{sender.dailyLimit} messages</p>
            </div>
          )}

          <div className="mt-4 flex flex-col items-start gap-1">
            <span className={`text-sm font-medium ${readiness.color}`}>
              {readiness.label}
            </span>
            <span className="text-xs text-slate-400 truncate max-w-full">
              {providerLabel}
            </span>
          </div>

          {mutationError && (
            <div className="mt-4 p-3 text-sm text-red-700 bg-red-50 rounded-md border border-red-100 flex flex-col gap-2">
              <p>{mutationError} Your current sender state is unchanged.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setMutationError(null)} className="font-medium hover:text-red-800">Dismiss</button>
              </div>
            </div>
          )}
        </div>
        
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 flex flex-wrap gap-2 rounded-b-lg">
          {sender.status === 'ACTIVE' && (
            <>
              <button onClick={() => handleStatusChange('PAUSED')} disabled={updateMutation.isPending} className="text-sm font-medium text-slate-600 hover:text-slate-900">Pause</button>
              <button onClick={() => setIsEditModalOpen(true)} disabled={updateMutation.isPending} className="text-sm font-medium text-slate-600 hover:text-slate-900">Edit</button>
              <button onClick={() => setIsDisableModalOpen(true)} disabled={updateMutation.isPending} className="text-sm font-medium text-red-600 hover:text-red-700 ml-auto">Disconnect</button>
            </>
          )}
          {sender.status === 'PAUSED' && (
            <>
              <button onClick={() => handleStatusChange('ACTIVE')} disabled={updateMutation.isPending} className="text-sm font-medium text-emerald-600 hover:text-emerald-700">Resume</button>
              <button onClick={() => setIsEditModalOpen(true)} disabled={updateMutation.isPending} className="text-sm font-medium text-slate-600 hover:text-slate-900">Edit</button>
              <button onClick={() => setIsDisableModalOpen(true)} disabled={updateMutation.isPending} className="text-sm font-medium text-red-600 hover:text-red-700 ml-auto">Disconnect</button>
            </>
          )}
          {sender.status === 'DISABLED' && (
            <button onClick={handleReconnect} disabled={updateMutation.isPending} className="text-sm font-medium text-emerald-600 hover:text-emerald-700">Reconnect</button>
          )}
        </div>
      </div>

      {isEditModalOpen && (
        <EditSenderModal sender={sender} onClose={() => setIsEditModalOpen(false)} />
      )}
      
      {isDisableModalOpen && (
        <DisableConfirmModal sender={sender} onClose={() => setIsDisableModalOpen(false)} />
      )}
    </>
  );
}

function EditSenderModal({ sender, onClose }: { sender: SenderAccount, onClose: () => void }) {
  const [fromName, setFromName] = useState(sender.fromName);
  const [fromEmail, setFromEmail] = useState(sender.fromEmail);
  const [replyTo, setReplyTo] = useState(sender.replyTo || '');
  const [dailyLimit, setDailyLimit] = useState(sender.dailyLimit?.toString() || '');
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useUpdateSenderAccount();
  const initialFocusRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initialFocusRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    updateMutation.mutate(
      { 
        id: sender.id, 
        data: { 
          fromName, 
          fromEmail, 
          replyTo: replyTo ? replyTo : null,
          dailyLimit: dailyLimit ? parseInt(dailyLimit, 10) : undefined 
        } 
      },
      {
        onSuccess: () => onClose(),
        onError: (err: unknown) => {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('Failed to update sender account');
          }
        }
      }
    );
  };

  return (
    <Modal isOpen={true} onClose={onClose} maxWidth="md">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 id="modal-title" className="text-lg font-semibold text-slate-900">Edit Sender Account</h2>
        </div>
        
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="edit-fromName" className="block text-sm font-medium text-slate-700 mb-1">
              From name
            </label>
            <input
              ref={initialFocusRef}
              type="text"
              id="edit-fromName"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              required
              className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="edit-fromEmail" className="block text-sm font-medium text-slate-700 mb-1">
              From email
            </label>
            <input
              type="email"
              id="edit-fromEmail"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              required
              className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="edit-replyTo" className="block text-sm font-medium text-slate-700 mb-1">
              Reply-to email <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="email"
              id="edit-replyTo"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="edit-dailyLimit" className="block text-sm font-medium text-slate-700 mb-1">
              Daily limit <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="number"
              id="edit-dailyLimit"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              min="1"
              placeholder="e.g. 500"
              className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={updateMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px]"
          >
            {updateMutation.isPending ? (
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
            ) : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DisableConfirmModal({ sender, onClose }: { sender: SenderAccount, onClose: () => void }) {
  const updateMutation = useUpdateSenderAccount();
  const [error, setError] = useState<string | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelBtnRef.current?.focus();
  }, []);

  const handleDisconnect = () => {
    setError(null);
    updateMutation.mutate(
      { id: sender.id, data: { status: 'DISABLED' } },
      {
        onSuccess: () => onClose(),
        onError: (err: unknown) => {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError("Couldn't disconnect this sender.");
          }
        }
      }
    );
  };

  return (
    <Modal isOpen={true} onClose={onClose} maxWidth="sm">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 id="modal-title" className="text-lg font-semibold text-slate-900">Disconnect sender</h3>
        </div>
        
        <div className="mt-4 text-sm text-slate-600">
          <p>This will make this sender unavailable for sending while keeping its historical records.</p>
        </div>

        {error && (
          <div className="mt-4 p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-100">
            {error}
          </div>
        )}
      </div>

      <div className="px-6 py-4 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
        <button
          ref={cancelBtnRef}
          type="button"
          onClick={onClose}
          disabled={updateMutation.isPending}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={updateMutation.isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md shadow-sm hover:bg-red-700 flex items-center"
        >
          {updateMutation.isPending ? (
              <svg className="animate-spin h-4 w-4 text-white mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
          ) : null}
          Disconnect
        </button>
      </div>
    </Modal>
  );
}

function AddSenderModal({ 
  integrations, 
  isLoading, 
  isError, 
  onClose 
}: { 
  integrations: Integration[], 
  isLoading: boolean, 
  isError: boolean, 
  onClose: () => void 
}) {
  const [integrationId, setIntegrationId] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [dailyLimit, setDailyLimit] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateSenderAccount();
  const initialFocusRef = useRef<HTMLSelectElement | HTMLButtonElement>(null);

  useEffect(() => {
    if (integrations.length > 0 && !integrationId) {
      setIntegrationId(integrations[0].id);
    }
  }, [integrations, integrationId]);

  useEffect(() => {
    initialFocusRef.current?.focus();
  }, [integrations.length, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!integrationId) {
      setError('Please select an integration');
      return;
    }

    createMutation.mutate(
      { 
        integrationId, 
        fromName, 
        fromEmail, 
        replyTo: replyTo || undefined,
        dailyLimit: dailyLimit ? parseInt(dailyLimit, 10) : undefined 
      },
      {
        onSuccess: () => onClose(),
        onError: (err: unknown) => {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('Failed to create sender account');
          }
        }
      }
    );
  };

  const selectedIntegration = integrations.find(i => i.id === integrationId);
  const isSelectedIntegrationDegraded = selectedIntegration && selectedIntegration.status !== 'ACTIVE';

  return (
    <Modal isOpen={true} onClose={onClose} maxWidth="md">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 id="modal-title" className="text-lg font-semibold text-slate-900">Add Sender Account</h2>
        </div>
        
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
              {error}
            </div>
          )}
          
          <div>
            <label htmlFor="integrationId" className="block text-sm font-medium text-slate-700 mb-1">
              Integration
            </label>
            
            {isLoading ? (
              <div className="text-sm text-slate-500 bg-slate-50 p-3 rounded-md border border-slate-200">
                Loading integrations...
              </div>
            ) : isError ? (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">
                Failed to load integrations.
              </div>
            ) : integrations.length === 0 ? (
              <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-md border border-amber-200">
                You have no configured integrations. Please set up an integration first.
              </div>
            ) : (
              <>
                <select
                  ref={initialFocusRef as any}
                  id="integrationId"
                  value={integrationId}
                  onChange={(e) => setIntegrationId(e.target.value)}
                  className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  required
                >
                  {integrations.map(int => (
                    <option key={int.id} value={int.id}>
                      {int.name} ({int.status.toLowerCase().replace('_', ' ')})
                    </option>
                  ))}
                </select>
                {isSelectedIntegrationDegraded && (
                  <div className="mt-2 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-100">
                    <strong>Note:</strong> The selected integration is currently <em>{selectedIntegration.status.toLowerCase().replace('_', ' ')}</em>. 
                    The sender account will not be fully ready until the integration is corrected.
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label htmlFor="fromName" className="block text-sm font-medium text-slate-700 mb-1">
              From name
            </label>
            <input
              type="text"
              id="fromName"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              required
              placeholder="e.g. Jane Doe"
              className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="fromEmail" className="block text-sm font-medium text-slate-700 mb-1">
              From email
            </label>
            <input
              type="email"
              id="fromEmail"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              required
              placeholder="e.g. jane@example.com"
              className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="replyTo" className="block text-sm font-medium text-slate-700 mb-1">
              Reply-to email <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="email"
              id="replyTo"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="Defaults to from email"
              className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="dailyLimit" className="block text-sm font-medium text-slate-700 mb-1">
              Daily limit <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="number"
              id="dailyLimit"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              min="1"
              placeholder="e.g. 500"
              className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending || integrations.length === 0 || isLoading || isError}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px]"
          >
            {createMutation.isPending ? (
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
            ) : 'Add sender'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
