import { createFileRoute } from '@tanstack/react-router';
import { useState, useRef, useEffect } from 'react';
import {
  useSenderAccounts,
  useCreateSenderAccount,
  useUpdateSenderAccount,
  SenderAccount,
} from '../../../api/sender-accounts';
import { useIntegrations, Integration } from '../../../api/integrations';
import { ApiError } from '../../../api/client';
import { Modal } from '../../../components/ui/Modal';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlusIcon, MailIcon, ZapIcon, AlertTriangle } from '@hugeicons/core-free-icons';;

export const Route = createFileRoute('/_authed/settings/senders')({
  component: SenderAccountsPage,
});

export function getEffectiveReadiness(
  sender: SenderAccount,
  integration?: Integration,
  isIntegrationsLoading?: boolean,
  isIntegrationsError?: boolean,
) {
  if (sender.status === 'PAUSED') {
    return {
      state: 'PAUSED',
      label: 'Paused',
      color: 'text-slate-600',
      bg: '#F3F4F6',
      border: '#D1D5DB',
      dot: '#9CA3AF',
      text: '#374151',
    };
  }
  if (sender.status === 'DISABLED') {
    return {
      state: 'DISCONNECTED',
      label: 'Disconnected',
      color: 'text-slate-600',
      bg: '#F3F4F6',
      border: '#D1D5DB',
      dot: '#9CA3AF',
      text: '#374151',
    };
  }

  if (isIntegrationsLoading) {
    return {
      state: 'LOADING',
      label: 'Loading readiness...',
      color: 'text-slate-400',
      bg: '#F8FAFC',
      border: '#E2E8F0',
      dot: '#94A3B8',
      text: '#64748B',
    };
  }
  if (isIntegrationsError) {
    return {
      state: 'CANNOT_DETERMINE_READINESS',
      label: 'Cannot determine readiness',
      color: 'text-slate-400',
      bg: '#FEF2F2',
      border: '#FECACA',
      dot: '#EF4444',
      text: '#991B1B',
    };
  }

  if (!integration) {
    return {
      state: 'CANNOT_DETERMINE_READINESS',
      label: 'Cannot determine readiness',
      color: 'text-slate-400',
      bg: '#FEF2F2',
      border: '#FECACA',
      dot: '#EF4444',
      text: '#991B1B',
    };
  }

  if (integration.status === 'ACTIVE') {
    return {
      state: 'READY',
      label: 'Ready',
      color: 'text-emerald-600',
      bg: '#ECFDF5',
      border: '#A7F3D0',
      dot: '#10B981',
      text: '#065F46',
    };
  }
  if (integration.status === 'INVALID_CREDENTIALS') {
    return {
      state: 'NEEDS_ATTENTION',
      label: 'Needs attention',
      color: 'text-amber-600',
      bg: '#FFFBEB',
      border: '#FDE68A',
      dot: '#F59E0B',
      text: '#78350F',
    };
  }
  if (integration.status === 'DISABLED') {
    return {
      state: 'UNAVAILABLE',
      label: 'Unavailable',
      color: 'text-red-600',
      bg: '#FEF2F2',
      border: '#FECACA',
      dot: '#EF4444',
      text: '#991B1B',
    };
  }

  return {
    state: 'UNKNOWN',
    label: 'Unknown',
    color: 'text-slate-500',
    bg: '#F3F4F6',
    border: '#D1D5DB',
    dot: '#6B7280',
    text: '#374151',
  };
}

function SenderAccountsPage() {
  const {
    data: senders,
    isLoading: isSendersLoading,
    error: sendersError,
  } = useSenderAccounts();
  const {
    data: integrations,
    isLoading: isIntegrationsLoading,
    isError: isIntegrationsError,
  } = useIntegrations();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const handleOpenAddModal = () => setIsAddModalOpen(true);
  const handleCloseAddModal = () => setIsAddModalOpen(false);

  if (isSendersLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <svg
          className="animate-spin h-6 w-6 text-slate-400"
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
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      </div>
    );
  }

  if (sendersError) {
    return (
      <div className="p-4 rounded-none-none bg-red-50 border border-red-200 text-red-800 text-sm">
        Failed to load sender accounts.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2
            className="text-[24px] font-bold tracking-tight text-slate-900"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Sender Accounts
          </h2>
          <p
            className="text-[14px] text-slate-500 mt-1"
            style={{ fontFamily: 'sans-serif' }}
          >
            Manage the email identities and sender accounts used for campaign
            outreach.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-1.5 rounded-none-none px-4 py-2 text-[13px] font-semibold text-white -xs  hover:opacity-90 self-start sm:self-auto shrink-0"
          style={{
            background: 'var(--color-primary)',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}
        >
          <HugeiconsIcon icon={PlusIcon} size={15} />
          Add sender
        </button>
      </header>

      {isIntegrationsError && (
        <div className="rounded-none-none bg-slate-50 p-4 border border-slate-200">
          <div className="flex items-start gap-3">
            <HugeiconsIcon icon={AlertTriangle} className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3
                className="text-[13.5px] font-semibold text-slate-900"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Integration state unavailable
              </h3>
              <p
                className="mt-1 text-[13px] text-slate-600 leading-relaxed"
                style={{ fontFamily: 'sans-serif' }}
              >
                We could not load your integration connections. The effective
                readiness of active sender accounts cannot be determined right
                now, but your historical sender records are below.
              </p>
            </div>
          </div>
        </div>
      )}

      {senders?.length === 0 ? (
        <div className="text-center rounded-none-none border border-dashed border-slate-300 p-12 bg-slate-50">
          <div
            className="w-12 h-12 rounded-none-none flex items-center justify-center mx-auto mb-3"
            style={{
              background: 'var(--color-muted)',
              color: 'var(--color-muted-fg)',
            }}
          >
            <HugeiconsIcon icon={MailIcon} size={22} strokeWidth={1.6} />
          </div>
          <h3
            className="text-[16px] font-bold text-slate-900 mb-1"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            No sender accounts
          </h3>
          <p
            className="text-[13.5px] text-slate-500 max-w-sm mx-auto"
            style={{ fontFamily: 'sans-serif' }}
          >
            Get started by adding a sender account based on an existing
            integration.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {senders?.map((sender) => {
            const integration = integrations?.find(
              (i) => i.id === sender.integrationId,
            );
            const readiness = getEffectiveReadiness(
              sender,
              integration,
              isIntegrationsLoading,
              isIntegrationsError,
            );

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

function SenderAccountCard({
  sender,
  integration,
  readiness,
  isIntegrationsError,
}: {
  sender: SenderAccount;
  integration?: Integration;
  readiness: ReturnType<typeof getEffectiveReadiness>;
  isIntegrationsError: boolean;
}) {
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
          setMutationError(
            `Couldn't ${newStatus === 'PAUSED' ? 'pause' : 'resume'} this sender.`,
          );
        },
      },
    );
  };

  const handleReconnect = () => {
    setMutationError(null);
    updateMutation.mutate(
      { id: sender.id, data: { status: 'ACTIVE' } },
      {
        onError: () => {
          setMutationError(`Couldn't reconnect this sender.`);
        },
      },
    );
  };

  const providerLabel = isIntegrationsError
    ? 'Integration information unavailable'
    : integration?.name || 'Unknown Provider';

  const initials = sender.fromName
    ? sender.fromName
      .split(' ')
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
    : sender.fromEmail.slice(0, 2).toUpperCase();

  return (
    <>
      <div className="rounded-none-none rounded-none-none border border-slate-200 bg-slate-50 hover:border-indigo-300 hover:-xs  flex flex-col justify-between overflow-hidden -xs">
        <div className="p-5 flex-1">
          {/* Header Row */}
          <div className="flex justify-between items-start gap-2 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-none-none flex items-center justify-center font-bold text-[13px] shrink-0"
                style={{
                  background: '#EEF2FF',
                  color: '#4F46E5',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <h3
                  className="text-[14.5px] font-bold text-slate-900 truncate"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  {sender.fromName}
                </h3>
                <p className="text-[12px] text-slate-500 truncate font-mono">
                  {sender.fromEmail}
                </p>
              </div>
            </div>

            {/* Readiness Badge Pill */}
            <span
              className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-none-full"
              style={{
                background: readiness.bg,
                color: readiness.text,
                border: `1px solid ${readiness.border}`,
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-none-full shrink-0"
                style={{ background: readiness.dot }}
              />
              {readiness.label}
            </span>
          </div>

          {/* Details */}
          <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-[12px] text-slate-600">
              <HugeiconsIcon icon={ZapIcon} size={13} className="text-slate-400 shrink-0" />
              <span className="truncate">{providerLabel}</span>
            </div>

            {sender.replyTo && sender.replyTo !== sender.fromEmail && (
              <p
                className="text-[12px] text-slate-500 truncate"
                style={{ fontFamily: 'sans-serif' }}
              >
                <span className="text-slate-400">Reply-to:</span> {sender.replyTo}
              </p>
            )}

            {sender.dailyLimit && (
              <p
                className="text-[12px] text-slate-500"
                style={{ fontFamily: 'sans-serif' }}
              >
                <span className="text-slate-400">Daily limit:</span>{' '}
                {sender.dailyLimit} messages
              </p>
            )}
          </div>

          {mutationError && (
            <div className="mt-3 p-3 text-xs text-red-700 bg-red-50 rounded-none-none border border-red-100 flex flex-col gap-1.5">
              <p>{mutationError} Your current sender state is unchanged.</p>
              <div className="flex justify-end">
                <button
                  onClick={() => setMutationError(null)}
                  className="font-semibold text-red-800 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Card Footer Actions */}
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 flex items-center justify-between gap-2">
          {sender.status === 'ACTIVE' && (
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleStatusChange('PAUSED')}
                  disabled={updateMutation.isPending}
                  className="text-[12.5px] font-semibold text-slate-600 hover:text-slate-900 "
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Pause
                </button>
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  disabled={updateMutation.isPending}
                  className="text-[12.5px] font-semibold text-slate-600 hover:text-slate-900 "
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Edit
                </button>
              </div>
              <button
                onClick={() => setIsDisableModalOpen(true)}
                disabled={updateMutation.isPending}
                className="text-[12.5px] font-semibold text-red-600 hover:text-red-700 "
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Disconnect
              </button>
            </>
          )}
          {sender.status === 'PAUSED' && (
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleStatusChange('ACTIVE')}
                  disabled={updateMutation.isPending}
                  className="text-[12.5px] font-semibold text-emerald-600 hover:text-emerald-700 "
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Resume
                </button>
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  disabled={updateMutation.isPending}
                  className="text-[12.5px] font-semibold text-slate-600 hover:text-slate-900 "
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  Edit
                </button>
              </div>
              <button
                onClick={() => setIsDisableModalOpen(true)}
                disabled={updateMutation.isPending}
                className="text-[12.5px] font-semibold text-red-600 hover:text-red-700 "
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                Disconnect
              </button>
            </>
          )}
          {sender.status === 'DISABLED' && (
            <button
              onClick={handleReconnect}
              disabled={updateMutation.isPending}
              className="text-[12.5px] font-semibold text-emerald-600 hover:text-emerald-700 "
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Reconnect
            </button>
          )}
        </div>
      </div>

      {isEditModalOpen && (
        <EditSenderModal
          sender={sender}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}

      {isDisableModalOpen && (
        <DisableConfirmModal
          sender={sender}
          onClose={() => setIsDisableModalOpen(false)}
        />
      )}
    </>
  );
}

function EditSenderModal({
  sender,
  onClose,
}: {
  sender: SenderAccount;
  onClose: () => void;
}) {
  const [fromName, setFromName] = useState(sender.fromName);
  const [fromEmail, setFromEmail] = useState(sender.fromEmail);
  const [replyTo, setReplyTo] = useState(sender.replyTo || '');
  const [dailyLimit, setDailyLimit] = useState(
    sender.dailyLimit?.toString() || '',
  );
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
          dailyLimit: dailyLimit ? parseInt(dailyLimit, 10) : undefined,
        },
      },
      {
        onSuccess: () => onClose(),
        onError: (err: unknown) => {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('Failed to update sender account');
          }
        },
      },
    );
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidth="md"
      preventClose={updateMutation.isPending}
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2
            id="modal-title"
            className="text-[17px] font-bold text-slate-900"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Edit Sender Account
          </h2>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-600 bg-red-50 rounded-none-none border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="edit-fromName"
              className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              From name
            </label>
            <input
              ref={initialFocusRef}
              type="text"
              id="edit-fromName"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              required
              className="block w-full px-3.5 py-2 text-sm rounded-none-none border border-slate-300 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="edit-fromEmail"
              className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              From email
            </label>
            <input
              type="email"
              id="edit-fromEmail"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              required
              className="block w-full px-3.5 py-2 text-sm rounded-none-none border border-slate-300 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="edit-replyTo"
              className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Reply-to email{' '}
              <span className="text-slate-400 font-normal lowercase">
                (optional)
              </span>
            </label>
            <input
              type="email"
              id="edit-replyTo"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              className="block w-full px-3.5 py-2 text-sm rounded-none-none border border-slate-300 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="edit-dailyLimit"
              className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Daily limit{' '}
              <span className="text-slate-400 font-normal lowercase">
                (optional)
              </span>
            </label>
            <input
              type="number"
              id="edit-dailyLimit"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              min="1"
              placeholder="e.g. 500"
              className="block w-full px-3.5 py-2 text-sm rounded-none-none border border-slate-300 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={updateMutation.isPending}
            className="px-4 py-2 text-[13px] font-semibold text-slate-600 hover:text-slate-900 "
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="px-4 py-2 text-[13px] font-semibold text-white rounded-none-none -xs -opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px]"
            style={{
              background: 'var(--color-primary)',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}
          >
            {updateMutation.isPending ? (
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
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            ) : (
              'Save changes'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DisableConfirmModal({
  sender,
  onClose,
}: {
  sender: SenderAccount;
  onClose: () => void;
}) {
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
        },
      },
    );
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidth="sm"
      preventClose={updateMutation.isPending}
    >
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-none-none bg-red-100 text-red-600">
            <HugeiconsIcon icon={AlertTriangle} size={20} />
          </div>
          <h3
            id="modal-title"
            className="text-[17px] font-bold text-slate-900"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Disconnect sender
          </h3>
        </div>

        <div className="mt-3 text-[13.5px] text-slate-600 leading-relaxed">
          <p>
            This will make this sender unavailable for sending while keeping its
            historical records.
          </p>
        </div>

        {error && (
          <div className="mt-4 p-3 text-xs text-red-600 bg-red-50 rounded-none-none border border-red-100">
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
          className="px-4 py-2 text-[13px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-none-none -xs hover:bg-slate-50 "
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={updateMutation.isPending}
          className="px-4 py-2 text-[13px] font-semibold text-white bg-red-600 rounded-none-none -xs hover:bg-red-700  flex items-center"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          {updateMutation.isPending ? (
            <svg
              className="animate-spin h-4 w-4 text-white mr-2"
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
                d="M4 12a8 8 0 018-8v8H4z"
              />
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
  onClose,
}: {
  integrations: Integration[];
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
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
        dailyLimit: dailyLimit ? parseInt(dailyLimit, 10) : undefined,
      },
      {
        onSuccess: () => onClose(),
        onError: (err: unknown) => {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError('Failed to create sender account');
          }
        },
      },
    );
  };

  const selectedIntegration = integrations.find((i) => i.id === integrationId);
  const isSelectedIntegrationDegraded =
    selectedIntegration && selectedIntegration.status !== 'ACTIVE';

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidth="md"
      preventClose={createMutation.isPending}
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2
            id="modal-title"
            className="text-[17px] font-bold text-slate-900"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Add Sender Account
          </h2>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-600 bg-red-50 rounded-none-none border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="integrationId"
              className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Integration
            </label>

            {isLoading ? (
              <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-none-none border border-slate-200">
                Loading integrations...
              </div>
            ) : isError ? (
              <div className="text-xs text-red-600 bg-red-50 p-3 rounded-none-none border border-red-200">
                Failed to load integrations.
              </div>
            ) : integrations.length === 0 ? (
              <div className="text-xs text-amber-700 bg-amber-50 p-3 rounded-none-none border border-amber-200">
                You have no configured integrations. Please set up an
                integration first.
              </div>
            ) : (
              <>
                <select
                  ref={initialFocusRef as React.RefObject<HTMLSelectElement>}
                  id="integrationId"
                  value={integrationId}
                  onChange={(e) => setIntegrationId(e.target.value)}
                  className="block w-full px-3.5 py-2 text-sm rounded-none-none border border-slate-300 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50"
                  required
                >
                  {integrations.map((int) => (
                    <option key={int.id} value={int.id}>
                      {int.name} ({int.status.toLowerCase().replace('_', ' ')})
                    </option>
                  ))}
                </select>
                {isSelectedIntegrationDegraded && (
                  <div className="mt-2 text-xs text-amber-700 bg-amber-50 p-2.5 rounded-none-none border border-amber-100">
                    <strong>Note:</strong> The selected integration is
                    currently{' '}
                    <em>
                      {selectedIntegration.status.toLowerCase().replace('_', ' ')}
                    </em>
                    . The sender account will not be fully ready until the
                    integration is corrected.
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label
              htmlFor="fromName"
              className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              From name
            </label>
            <input
              type="text"
              id="fromName"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              required
              placeholder="e.g. Jane Doe"
              className="block w-full px-3.5 py-2 text-sm rounded-none-none border border-slate-300 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="fromEmail"
              className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              From email
            </label>
            <input
              type="email"
              id="fromEmail"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              required
              placeholder="e.g. jane@example.com"
              className="block w-full px-3.5 py-2 text-sm rounded-none-none border border-slate-300 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="replyTo"
              className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Reply-to email{' '}
              <span className="text-slate-400 font-normal lowercase">
                (optional)
              </span>
            </label>
            <input
              type="email"
              id="replyTo"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="Defaults to from email"
              className="block w-full px-3.5 py-2 text-sm rounded-none-none border border-slate-300 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="dailyLimit"
              className="block text-[12px] font-bold uppercase tracking-wide text-slate-700 mb-1"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Daily limit{' '}
              <span className="text-slate-400 font-normal lowercase">
                (optional)
              </span>
            </label>
            <input
              type="number"
              id="dailyLimit"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              min="1"
              placeholder="e.g. 500"
              className="block w-full px-3.5 py-2 text-sm rounded-none-none border border-slate-300 -xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={createMutation.isPending}
            className="px-4 py-2 text-[13px] font-semibold text-slate-600 hover:text-slate-900 "
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              createMutation.isPending ||
              integrations.length === 0 ||
              isLoading ||
              isError
            }
            className="px-4 py-2 text-[13px] font-semibold text-white rounded-none-none -xs -opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[80px]"
            style={{
              background: 'var(--color-primary)',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}
          >
            {createMutation.isPending ? (
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
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            ) : (
              'Add sender'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
