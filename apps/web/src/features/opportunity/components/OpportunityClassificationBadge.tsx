
export type ClassificationType = 'CONFIRMED' | 'PROACTIVE' | 'UNCLASSIFIED';

export const OPP_STATUS_CFG: Record<ClassificationType, { label: string; color: string; bg: string; border: string; dot: string; desc: string }> = {
  CONFIRMED: { label: 'Confirmed', color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0', dot: '#10B981', desc: 'Actual evidence of a relevant opening exists.' },
  PROACTIVE: { label: 'Proactive', color: '#3730A3', bg: '#EEF2FF', border: '#C7D2FE', dot: '#4F46E5', desc: 'No confirmed opening, but company signals provide a credible reason to reach out.' },
  UNCLASSIFIED: { label: 'Unclassified', color: '#92400E', bg: '#FEF3C7', border: '#FDE68A', dot: '#F59E0B', desc: 'Not enough evidence yet to classify. Research must be complete before classification.' },
};

export function OpportunityClassificationBadge({ type }: { type: string }) {
  const t = (type as ClassificationType) || 'UNCLASSIFIED';
  const cfg = OPP_STATUS_CFG[t] || OPP_STATUS_CFG.UNCLASSIFIED;

  return (
    <span
      className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
      style={{ 
        background: cfg.bg, 
        color: cfg.color, 
        border: `1px solid ${cfg.border}`, 
        fontFamily: 'Plus Jakarta Sans, sans-serif' 
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
      {cfg.label}
    </span>
  );
}
