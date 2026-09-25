import { IconSvgObject } from "@hugeicons/core-free-icons/types";
import { HugeiconsIcon } from '@hugeicons/react';
HugeiconsIcon
export function GateCard({
  icon,
  heading,
  body,
  cta,
  onCta,
  ctaVariant = 'default',
}: {
  icon: IconSvgObject;
  heading: string;
  body: string;
  cta?: string;
  onCta?: () => void;
  ctaVariant?: 'default' | 'amber';
}) {
  const ctaBg = ctaVariant === 'amber' ? 'bg-[#78350F] hover:bg-[#92400E]' : 'bg-(--color-primary) hover:bg-[#1E2D4A]';

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-8 bg-slate-50 rounded-none-none border border-slate-200 ">
      <div
        className="w-11 h-11 rounded-none-none flex items-center justify-center"
        style={{ background: 'var(--color-muted)', color: 'var(--color-muted-fg)' }}
      >
        <HugeiconsIcon icon={icon} size={20} strokeWidth={1.7} />
      </div>
      <div className="text-center max-w-md">
        <p className="text-[17px] font-bold mb-2 text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {heading}
        </p>
        <p className="text-[13.5px] leading-relaxed text-slate-500" style={{ fontFamily: 'sans-serif' }}>
          {body}
        </p>
      </div>
      {cta && onCta && (
        <button
          onClick={onCta}
          className={`mt-2 flex items-center gap-2 px-4 py-2.5 rounded-none-none text-[13.5px] font-semibold text-white  ${ctaBg}`}
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          {cta}
        </button>
      )}
    </div>
  );
}
