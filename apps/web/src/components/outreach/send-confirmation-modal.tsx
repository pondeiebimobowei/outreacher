import { useEffect, useRef, useState } from 'react';

export interface SendConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dontAskAgain: boolean) => void;
  contactName: string;
  contactTitle?: string | null;
  companyName?: string;
  recipientEmail: string;
  subject: string;
  bodyPreview?: string;
}

export function SendConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  contactName,
  contactTitle,
  companyName,
  recipientEmail,
  subject,
  bodyPreview,
}: SendConfirmationModalProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap & Escape listener
  useEffect(() => {
    if (!isOpen) return;

    confirmButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusableElements || focusableElements.length === 0) return;

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
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-send-modal-title"
        aria-describedby="confirm-send-modal-desc"
        className="bg-slate-50 rounded-none-none  border border-slate-200 max-w-lg w-full p-6 space-y-5 text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <h2
            id="confirm-send-modal-title"
            className="text-base font-bold text-slate-900"
          >
            Confirm Outreach Dispatch
          </h2>
          <p id="confirm-send-modal-desc" className="text-xs text-slate-500">
            An email will be dispatched to this contact after a 5-second buffer window.
          </p>
        </div>

        {/* Recipient Card */}
        <div className="bg-slate-50 p-3.5 rounded-none-none border border-slate-200 space-y-2 text-xs">
          <div>
            <span className="text-slate-400 font-medium">Recipient: </span>
            <span className="font-semibold text-slate-900">
              {contactName}
              {contactTitle ? ` · ${contactTitle}` : ''}
              {companyName ? ` · ${companyName}` : ''}
            </span>
          </div>
          <div>
            <span className="text-slate-400 font-medium">To: </span>
            <span className="font-mono text-slate-700">{recipientEmail}</span>
          </div>
          <div>
            <span className="text-slate-400 font-medium">Subject: </span>
            <span className="font-medium text-slate-900">{subject}</span>
          </div>
          {bodyPreview && (
            <div className="pt-1 text-slate-600 line-clamp-2 italic border-t border-slate-200/60 mt-1">
              &ldquo;{bodyPreview}&rdquo;
            </div>
          )}
        </div>

        {/* Don't ask again checkbox */}
        <label className="flex items-center space-x-2.5 cursor-pointer select-none text-xs text-slate-700">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            className="rounded-none border-slate-300 text-slate-900 focus:ring-slate-900 w-4 h-4 cursor-pointer"
          />
          <span>Don&apos;t ask again for single sends</span>
        </label>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-none-none  focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            Cancel
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => onConfirm(dontAskAgain)}
            className="min-h-11 px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-none-none   focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            Confirm &amp; Send
          </button>
        </div>
      </div>
    </div>
  );
}
