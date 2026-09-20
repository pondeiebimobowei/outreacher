import React, { useState, useEffect } from 'react';
import { useSenderAccounts } from '../../api/sender-accounts';

export interface SenderAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (senderIds: string[]) => void;
  isSaving: boolean;
  initialSelectedIds: string[];
}

export function SenderAssignmentModal({
  isOpen,
  onClose,
  onSave,
  isSaving,
  initialSelectedIds,
}: SenderAssignmentModalProps) {
  const { data: senderAccounts, isLoading, isError } = useSenderAccounts();
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(initialSelectedIds);
    }
  }, [isOpen, initialSelectedIds]);

  if (!isOpen) return null;

  const handleToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(selectedIds);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Assign Sender Accounts</h2>
          <p className="text-sm text-slate-500 mt-1">
            Select one or more sender accounts to dispatch this campaign.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {isLoading && <p className="text-sm text-slate-500 text-center">Loading sender accounts...</p>}
          {isError && <p className="text-sm text-red-500 text-center">Failed to load sender accounts.</p>}

          {!isLoading && !isError && senderAccounts && senderAccounts.length === 0 && (
            <div className="text-center p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-sm font-medium text-slate-700">No sender accounts configured.</p>
              <p className="text-xs text-slate-500 mt-1">Please create a sender account in Settings first.</p>
            </div>
          )}

          {!isLoading && !isError && senderAccounts && senderAccounts.length > 0 && (
            <div className="space-y-3">
              {senderAccounts.map((sender) => {
                const isSelected = selectedIds.includes(sender.id);
                const isEligible = sender.status === 'ACTIVE';

                return (
                  <label
                    key={sender.id}
                    className={`flex items-start p-4 border rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-slate-900 bg-slate-50/50'
                        : 'border-slate-200 hover:bg-slate-50'
                    } ${!isEligible ? 'opacity-75 bg-slate-50' : ''}`}
                  >
                    <div className="flex-shrink-0 h-5 items-center flex mt-0.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(sender.id)}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      />
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {sender.fromName} &lt;{sender.fromEmail}&gt;
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        {sender.status === 'ACTIVE' ? (
                          <span className="text-xs font-medium text-emerald-700">Active</span>
                        ) : (
                          <span className="text-xs font-medium text-slate-500">
                            {sender.status === 'PAUSED' ? 'Paused' : 'Disabled'}
                          </span>
                        )}
                        {!isEligible && (
                          <span className="text-xs text-amber-600 font-medium">· Ineligible for dispatch</span>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Assignments'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
