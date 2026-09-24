import { useEffect, useRef } from 'react';
import { EvaluatedContactDto } from '../../api/contacts';

interface ContactDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: EvaluatedContactDto | null;
  companyName: string;
  onSelect: (contactId: string) => void;
  isSelectPending: boolean;
}

const AVATAR_COLORS = [
  '#7C3AED',
  '#0F766E',
  '#B45309',
  '#0369A1',
  '#BE185D',
  '#1D4ED8',
  '#065F46',
  '#9D174D',
  '#92400E',
  '#1E40AF',
];

function pickAvatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (name.slice(0, 2) || '??').toUpperCase();
}

export function ContactDetailModal({
  isOpen,
  onClose,
  contact,
  companyName,
  onSelect,
  isSelectPending,
}: ContactDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      modalRef.current?.focus();
    } else if (triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !contact) return null;

  const isPerson = contact.contactKind === 'PERSON';
  const isSelected = contact.isSelected;
  const isEmailAvailable = contact.emailConfidence === 'AVAILABLE' && Boolean(contact.email);
  const avatarBg = pickAvatarColor(contact.name || contact.id);
  const initials = getInitials(contact.name || '??');

  return (
    <div
      aria-modal="true"
      aria-labelledby="contact-detail-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-5 focus:outline-none animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
      >
        {/* Header: Avatar, Identity, Title, Badges, Close */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div
              className="w-11 h-11 rounded-lg flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-xs mt-0.5"
              style={{
                backgroundColor: avatarBg,
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}
            >
              {initials}
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="contact-detail-modal-title"
                  className="text-lg font-bold text-slate-900 tracking-tight"
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  {contact.name}
                </h2>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                    isPerson
                      ? 'bg-sky-100 text-sky-800 border border-sky-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {contact.contactKind}
                </span>
                {contact.source === 'USER_PROVIDED' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-300 uppercase tracking-wider">
                    User Provided
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-600">
                {contact.title || 'Role context available'} &bull; {companyName}
              </p>
            </div>
          </div>

          <button
            aria-label="Close contact detail modal"
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            ✕
          </button>
        </div>

        {/* 1. Relevance & Narrative Rationale */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] font-bold uppercase tracking-wider text-slate-500"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Relevance Evaluation
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                contact.relevance === 'HIGH'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                  : contact.relevance === 'MEDIUM'
                    ? 'bg-sky-50 text-sky-800 border border-sky-300'
                    : 'bg-slate-100 text-slate-700 border border-slate-300'
              }`}
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Relevance: {contact.relevance}
            </span>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed">
            <span
              className="font-bold text-slate-900 block mb-1"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Why This Contact:
            </span>
            <p>{contact.recommendationRationale}</p>
          </div>
        </div>

        {/* 2. Identity Ground Truth & Provenance */}
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <span
            className="text-[11px] font-bold uppercase tracking-wider text-slate-500"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Identity & Provenance Evidence
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200">
            <div>
              <span className="font-semibold text-slate-700">Source Origin:</span>{' '}
              <span className="text-slate-900">{contact.source || 'Company Website'}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-700">Identity Confidence:</span>{' '}
              <span className="font-bold text-slate-900">{contact.confidence || 'MEDIUM'}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-700">Discovered Date:</span>{' '}
              <span className="text-slate-900">
                {contact.discoveredAt
                  ? new Date(contact.discoveredAt).toLocaleDateString()
                  : 'Recent Run'}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-700">Email Status:</span>{' '}
              <span
                className={
                  isEmailAvailable ? 'text-emerald-700 font-bold' : 'text-slate-600 font-medium'
                }
              >
                {contact.emailConfidence}
              </span>
            </div>
          </div>

          {contact.sourceUrl && (
            <div className="text-xs pt-1">
              <span className="font-semibold text-slate-700 mr-2">Source Page:</span>
              <a
                href={contact.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-slate-900 hover:underline font-mono inline-flex items-center space-x-1 focus:outline-none focus:ring-2 focus:ring-slate-900 rounded px-1"
              >
                <span>View Source Page</span>
                <span>&nearr;</span>
              </a>
            </div>
          )}
        </div>

        {/* 3. Available Contact Channel */}
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <span
            className="text-[11px] font-bold uppercase tracking-wider text-slate-500"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Contact Channel Availability
          </span>
          {isEmailAvailable ? (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs flex items-center justify-between text-emerald-900 font-mono">
              <span className="font-semibold">Email Channel:</span>
              <span className="font-bold">{contact.email}</span>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1 text-slate-700">
              <div className="flex items-center space-x-2">
                <span className="font-semibold">Email Channel:</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-200 text-slate-800">
                  Email Unavailable
                </span>
              </div>
              <p className="text-[11px] text-slate-500 italic">
                Identity verified from source; direct email address is unestablished.
                Zero-fabrication posture enforced.
              </p>
            </div>
          )}
        </div>

        {/* Footer / Selection Action */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Close Review
          </button>

          {isSelected ? (
            <span
              className="px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 rounded-lg inline-flex items-center space-x-1"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              <span>✓ Selected Target</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                onSelect(contact.id);
                onClose();
              }}
              disabled={isSelectPending}
              className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {isSelectPending ? 'Selecting...' : 'Select Target Contact'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
