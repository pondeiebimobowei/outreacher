import { LucideIcon } from 'lucide-react';

export function GateCard({
  icon: Icon,
  heading,
  body,
  cta,
  onCta,
  ctaVariant = 'default',
}: {
  icon: LucideIcon;
  heading: string;
  body: string;
  cta?: string;
  onCta?: () => void;
  ctaVariant?: 'default' | 'amber';
}) {
  const ctaBg = ctaVariant === 'amber' ? 'bg-[#78350F] hover:bg-[#92400E]' : 'bg-[var(--color-primary)] hover:bg-[#1E2D4A]';
  
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-8 bg-white rounded-xl border border-slate-200 shadow-sm">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center"
        style={{ background: 'var(--color-muted)', color: 'var(--color-muted-fg)' }}
      >
        <Icon size={20} strokeWidth={1.7} />
      </div>
      <div className="text-center max-w-md">
        <p className="text-[17px] font-bold mb-2 text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {heading}
        </p>
        <p className="text-[13.5px] leading-relaxed text-slate-500" style={{ fontFamily: 'Inter, sans-serif' }}>
          {body}
        </p>
      </div>
      {cta && onCta && (
        <button
          onClick={onCta}
          className={`mt-2 flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13.5px] font-semibold text-white transition-colors ${ctaBg}`}
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          {cta}
        </button>
      )}
    </div>
  );
}
