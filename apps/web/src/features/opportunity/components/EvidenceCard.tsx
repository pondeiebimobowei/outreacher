import { EvidenceDto } from '../../../api/research';

export function EvidenceCard({ evidence }: { evidence: EvidenceDto[] }) {
  if (!evidence || evidence.length === 0) return null;

  return (
    <div className="rounded-none-none overflow-hidden" style={{ border: '1px solid var(--color-border)', background: 'var(--color-card)' }}>
      <div className="px-5 py-3.5" style={{ background: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)' }}>
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Plus Jakarta Sans, sans-serif', letterSpacing: '0.07em' }}>
          Evidence
        </p>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {evidence.map((ev) => {
          let label = 'Unverified';
          let bg = '#F3F4F6';
          let color = '#6B7280';
          let border = '#E5E7EB';

          if (ev.classification === 'FACT' || (ev.confidence && ev.confidence >= 0.8)) {
            label = 'High';
            color = '#065F46';
            bg = '#ECFDF5';
            border = '#A7F3D0';
          } else if (ev.confidence && ev.confidence >= 0.5) {
            label = 'Medium';
            color = '#92400E';
            bg = '#FEF3C7';
            border = '#FDE68A';
          }

          return (
            <div key={ev.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] mb-1 leading-relaxed" style={{ color: 'var(--color-primary)', fontFamily: 'sans-serif' }}>
                  {ev.claim}
                </p>
                <div className="text-[12px] flex items-center flex-wrap gap-1" style={{ color: 'var(--color-accent)', fontFamily: 'sans-serif' }}>
                  <span className="font-medium">{ev.sourceName || 'Unknown Source'}</span>
                  {ev.collectedAt && <span className="opacity-70">· {new Date(ev.collectedAt).toLocaleDateString()}</span>}
                </div>
                {ev.sourceExcerpt && (
                  <p className="mt-2 text-[12px] italic border-l-2 pl-3 py-0.5" style={{ color: 'var(--color-muted-fg)', borderColor: 'var(--color-border)', fontFamily: 'sans-serif' }}>
                    "{ev.sourceExcerpt}"
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-none-full inline-flex items-center" style={{ background: bg, color: color, border: `1px solid ${border}`, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
