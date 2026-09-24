export function OpportunityLifecycleBadge({ status }: { status: 'ACTIVE' | 'CLOSED' | 'SUPERSEDED' | string }) {
  // Production lifecycle states
  const STATUS_CFG = {
    ACTIVE: { label: 'Active', color: '#166534', bg: '#ECFDF5', border: '#A7F3D0' },
    CLOSED: { label: 'Closed', color: '#991B1B', bg: '#FEF2F2', border: '#FCA5A5' },
    SUPERSEDED: { label: 'Superseded', color: '#92400E', bg: '#FEF3C7', border: '#FDE68A' },
  } as const;

  const cfg = (STATUS_CFG as Record<string, typeof STATUS_CFG[keyof typeof STATUS_CFG]>)[status] ?? null;

  if (!cfg) return null;

  return (
    <span
      className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-none-full"
      style={{
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      }}
    >
      {cfg.label}
    </span>
  );
}
