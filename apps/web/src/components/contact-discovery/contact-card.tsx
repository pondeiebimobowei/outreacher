import { EvaluatedContactDto } from '../../api/contacts';
import { ContactProvenance } from './contact-provenance';

interface ContactCardProps {
  contact: EvaluatedContactDto;
  onSelect: (contactId: string) => void;
  isSelectPending: boolean;
  onReview?: (contact: EvaluatedContactDto) => void;
  onReviewOutreach?: (contact: EvaluatedContactDto) => void;
  isDrawerActive?: boolean;
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

export function ContactCard({
  contact,
  onSelect,
  isSelectPending,
  onReview,
  onReviewOutreach,
  isDrawerActive,
}: ContactCardProps) {
  const isPerson = contact.contactKind === 'PERSON';
  const isSelected = contact.isSelected;
  const isEmailAvailable = contact.emailConfidence === 'AVAILABLE' && Boolean(contact.email);
  const avatarBg = pickAvatarColor(contact.firstName || contact.id);
  const initials = getInitials(contact.firstName || '??');

  return (
    <div
      className={`p-5 rounded-none-none border  space-y-4 ${
        isSelected
          ? 'bg-slate-900 text-white border-slate-900  ring-2 ring-slate-900'
          : 'bg-slate-50 text-slate-900 border-slate-200 hover:border-slate-300 -xs'
      }`}
    >
      {/* 1. Header: Avatar, Name, Title, Badges & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          {/* Avatar with Initials */}
          <div
            className="w-10 h-10 rounded-none-none flex items-center justify-center font-bold text-xs text-white shrink-0 -xs mt-0.5"
            style={{
              backgroundColor: avatarBg,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
            }}
          >
            {initials}
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={`text-base font-bold tracking-tight truncate ${
                  isSelected ? 'text-white' : 'text-slate-900'
                }`}
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {contact.firstName}
              </h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-none text-[10px] font-extrabold uppercase tracking-wider ${
                  isPerson
                    ? isSelected
                      ? 'bg-sky-900 text-sky-200 border border-sky-700'
                      : 'bg-sky-100 text-sky-800 border border-sky-300'
                    : isSelected
                      ? 'bg-amber-900 text-amber-200 border border-amber-700'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {contact.contactKind}
              </span>
              {contact.source === 'USER_PROVIDED' && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-none text-[10px] font-extrabold uppercase tracking-wider ${
                    isSelected
                      ? 'bg-indigo-900 text-indigo-200 border border-indigo-700'
                      : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                  }`}
                >
                  User Provided
                </span>
              )}
              {isSelected && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-none text-[10px] font-extrabold bg-emerald-500 text-white uppercase tracking-wider -xs">
                  Selected Target
                </span>
              )}
              {isDrawerActive && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-none text-[10px] font-extrabold bg-sky-500 text-white uppercase tracking-wider -xs">
                  Draft in Review
                </span>
              )}
            </div>

            <p className={`text-xs font-medium ${isSelected ? 'text-slate-300' : 'text-slate-600'}`}>
              {contact.title || 'Role context available via research'}
            </p>
          </div>
        </div>

        {/* Action Controls: Review Details & Select Target / Review Outreach */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onReview && (
            <button
              type="button"
              onClick={() => onReview(contact)}
              className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-none-none border  focus:outline-none focus:ring-2 focus:ring-slate-900 flex items-center justify-center ${
                isSelected
                  ? 'text-slate-200 bg-slate-800 border-slate-700 hover:bg-slate-700'
                  : 'text-slate-700 bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              Review Details
            </button>
          )}

          {isSelected ? (
            <div className="flex items-center space-x-2">
              <span className="min-h-[40px] px-3 py-1.5 text-xs font-bold text-emerald-400 bg-slate-800 border border-emerald-500/40 rounded-none-none inline-flex items-center space-x-1">
                <span>&check; Target Active</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  onReviewOutreach ? onReviewOutreach(contact) : onReview ? onReview(contact) : undefined
                }
                className="min-h-[40px] px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 rounded-none-none -xs  focus:outline-none focus:ring-2 focus:ring-emerald-400 flex items-center justify-center gap-1.5"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                <span>Review Outreach Draft</span>
                <span aria-hidden="true">&rarr;</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onSelect(contact.id)}
              disabled={isSelectPending}
              className="min-h-[40px] px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-none-none -xs  focus:outline-none focus:ring-2 focus:ring-slate-900 flex items-center justify-center"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {isSelectPending ? 'Selecting...' : 'Select Target Contact'}
            </button>
          )}
        </div>
      </div>

      {/* 2. Badges Row: Relevance, Identity Confidence & Email Availability */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Relevance Badge */}
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-none-full text-xs font-bold ${
            contact.relevance === 'HIGH'
              ? isSelected
                ? 'bg-emerald-900 text-emerald-200 border border-emerald-700'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : contact.relevance === 'MEDIUM'
                ? isSelected
                  ? 'bg-sky-900 text-sky-200 border border-sky-700'
                  : 'bg-sky-50 text-sky-800 border border-sky-300'
                : isSelected
                  ? 'bg-slate-800 text-slate-300 border border-slate-700'
                  : 'bg-slate-100 text-slate-700 border border-slate-300'
          }`}
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          Relevance: {contact.relevance}
        </span>

        {/* Identity Confidence Badge */}
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-none-full text-[11px] font-semibold ${
            isSelected
              ? 'bg-slate-800 text-slate-300 border border-slate-700'
              : 'bg-slate-50 text-slate-700 border border-slate-200'
          }`}
        >
          Identity: {contact.confidence || 'MEDIUM'}
        </span>

        {/* Email Confidence Badge */}
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-none-full text-[11px] font-semibold ${
            isEmailAvailable
              ? isSelected
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : isSelected
                ? 'bg-slate-800 text-slate-400 border border-slate-700'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
          }`}
        >
          Email: {contact.emailConfidence}
        </span>
      </div>

      {/* 3. Why This Contact - Explainable Rationale */}
      <div
        className={`p-3.5 rounded-none-none text-xs leading-relaxed border ${
          isSelected
            ? 'bg-slate-800/90 border-slate-700 text-slate-200'
            : 'bg-slate-50/80 border-slate-200 text-slate-700'
        }`}
      >
        <span
          className={`font-bold block uppercase tracking-wider text-[10px] mb-1 ${
            isSelected ? 'text-slate-400' : 'text-slate-900'
          }`}
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          Why This Contact:
        </span>
        <p>{contact.recommendationRationale}</p>
      </div>

      {/* 4. Contact Address / Missing Email Display */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs pt-1">
        <div>
          {isEmailAvailable ? (
            <div className="flex items-center space-x-2 font-mono">
              <span className={`font-semibold ${isSelected ? 'text-slate-300' : 'text-slate-700'}`}>
                Email:
              </span>
              <span className={`font-medium ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                {contact.email}
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 flex-wrap">
              <span className={`font-semibold ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                Email:
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-none text-xs font-semibold bg-slate-200 text-slate-700">
                Email Unavailable
              </span>
              <span
                className={`text-[11px] italic ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}
              >
                (Identity verified from source; email address unestablished)
              </span>
            </div>
          )}
        </div>

        {/* Provenance Inspection Trigger */}
        <ContactProvenance contact={contact} />
      </div>
    </div>
  );
}
