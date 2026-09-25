import { useState } from 'react';
import { EvaluatedPersonDto } from '../../api/contacts';

interface ContactProvenanceProps {
  contact: EvaluatedPersonDto;
}

export function ContactProvenance({ contact }: ContactProvenanceProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="text-xs">
      <button
        type="button"
        id={`provenance-toggle-${contact.id}`}
        aria-expanded={isOpen}
        aria-controls={`provenance-details-${contact.id}`}
        onClick={() => setIsOpen(!isOpen)}
        className="min-h-[44px] text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-none px-3 py-2  focus:outline-none focus:ring-2 focus:ring-slate-900 inline-flex items-center"
      >
        {isOpen ? 'Hide Provenance ▲' : 'Inspect Provenance ▼'}
      </button>

      {isOpen && (
        <div
          id={`provenance-details-${contact.id}`}
          role="region"
          aria-labelledby={`provenance-toggle-${contact.id}`}
          className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-none-none space-y-2 text-slate-700"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-900 border-b border-slate-100 pb-1">
            <span>Discovery Ground Truth & Provenance</span>
            <span className="font-mono text-slate-500">ID: {contact.id.slice(0, 8)}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="font-semibold text-slate-800">Source:</span>{' '}
              <span>{contact.source || 'Company Website'}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-800">Identity Confidence:</span>{' '}
              <span className="font-bold">{contact.confidence || 'MEDIUM'}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-800">Discovered:</span>{' '}
              <span>
                {contact.discoveredAt
                  ? new Date(contact.discoveredAt).toLocaleDateString()
                  : 'Recent Run'}
              </span>
            </div>
            <div>
              <span className="font-semibold text-slate-800">Email Status:</span>{' '}
              <span
                className={
                  contact.email ? 'text-emerald-700 font-bold' : 'text-slate-500 font-medium'
                }
              >
                {contact.emailConfidence}
              </span>
            </div>
          </div>

          {contact.sourceUrl && (
            <div className="pt-1 border-t border-slate-100 text-[11px]">
              <span className="font-semibold text-slate-800 block mb-0.5">Source Page:</span>
              <a
                href={contact.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-slate-900 hover:underline font-mono inline-flex items-center space-x-1 focus:outline-none focus:ring-2 focus:ring-slate-900 rounded-none px-1 min-h-[44px] sm:min-h-0"
              >
                <span>View Source Page</span>
                <span>↗</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
