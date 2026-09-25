import { createFileRoute } from '@tanstack/react-router';
import { HugeiconsIcon } from '@hugeicons/react';
import { FileTextIcon } from '@hugeicons/core-free-icons';;

export const Route = createFileRoute('/_authed/templates')({
  component: TemplatesComingSoonComponent,
});

// ─── Planned category preview (non-functional illustration) ───────────────────
//
// These categories represent planned template types for a future release.
// They are not backed by any production API and carry no interactivity.

const PLANNED_CATEGORIES: Array<{
  label: string;
  color: string;
  bg: string;
  border: string;
}> = [
    { label: 'Networking', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
    { label: 'Referral', color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0' },
    {
      label: 'Hiring Manager',
      color: '#5B21B6',
      bg: '#F5F3FF',
      border: '#DDD6FE',
    },
    { label: 'Recruiter', color: '#92400E', bg: '#FFF7ED', border: '#FED7AA' },
    { label: 'Follow-up', color: '#7C3AED', bg: '#FEF3C7', border: '#FDE68A' },
  ];

// ─── Planned personalisation variable preview (non-functional illustration) ───
//
// These variable placeholders illustrate planned personalisation support.
// They are not currently evaluated or substituted in any production outreach.

const PLANNED_VARIABLES = [
  { tag: '{{firstName}}', description: 'Contact first name' },
  { tag: '{{company}}', description: 'Target company name' },
  { tag: '{{role}}', description: 'Job role being applied for' },
];

// ─── Component ────────────────────────────────────────────────────────────────

function TemplatesComingSoonComponent() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">
      {/* Page header */}
      <div className="mb-8">
        <h1
          className="text-[24px] font-bold tracking-tight text-(--color-primary)"
          style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
        >
          Email templates
        </h1>
        <p
          className="text-[14px] mt-1 text-muted-fg"
          style={{ fontFamily: 'sans-serif' }}
        >
          Create reusable outreach messages that can be adapted for different
          companies and contacts.
        </p>
      </div>

      {/* Main coming-soon card */}
      <div
        className="rounded-none-none overflow-hidden"
        style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 1px 4px 0 rgba(0,0,0,0.06)',
        }}
      >
        {/* Card header */}
        <div
          className="px-6 py-5 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-none-none flex items-center justify-center"
              style={{
                background: 'var(--color-muted)',
                color: 'var(--color-muted-fg)',
              }}
            >
              <HugeiconsIcon icon={FileTextIcon} className="w-[18px] h-[18px]" strokeWidth={1.5} />
            </div>
            <h2
              className="text-[15px] font-bold text-(--color-primary)"
              style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            >
              Template library
            </h2>
          </div>

          {/* Coming soon badge */}
          <span
            className="text-[11px] font-semibold px-2.5 py-1 rounded-none-full tracking-wide"
            style={{
              background: '#F5F3FF',
              color: '#5B21B6',
              border: '1px solid #DDD6FE',
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              letterSpacing: '0.04em',
            }}
            aria-label="Feature status: coming soon"
          >
            Coming soon
          </span>
        </div>

        {/* Empty state body */}
        <div className="flex flex-col items-center justify-center gap-6 py-16 px-8">
          <div
            className="w-14 h-14 rounded-none-none flex items-center justify-center"
            style={{
              background: 'var(--color-muted)',
              color: 'var(--color-muted-fg)',
            }}
          >
            <HugeiconsIcon icon={FileTextIcon} className="w-7 h-7" strokeWidth={1.5} />
          </div>

          <div className="text-center max-w-md">
            <p
              className="text-[14px] leading-relaxed text-muted-fg"
              style={{ fontFamily: 'sans-serif' }}
            >
              Template management is on the roadmap. When available, you will be
              able to save, organise, and reuse outreach messages across
              campaigns.
            </p>
          </div>
        </div>

        {/* Preview sections */}
        <div
          className="px-6 pb-8"
          style={{ borderTop: '1px solid var(--color-border)' }}
          aria-label="Planned feature previews (not yet available)"
        >
          {/* Planned categories */}
          <div className="pt-6 mb-6">
            <p
              className="text-[11.5px] font-bold uppercase tracking-wide mb-3"
              style={{
                color: 'var(--color-muted-fg)',
                fontFamily: '"Plus Jakarta Sans", sans-serif',
                letterSpacing: '0.07em',
              }}
            >
              Planned template categories
            </p>
            <div className="flex flex-wrap gap-2">
              {PLANNED_CATEGORIES.map((cat) => (
                <span
                  key={cat.label}
                  className="text-[11.5px] font-semibold px-2.5 py-1 rounded-none-full"
                  style={{
                    background: cat.bg,
                    color: cat.color,
                    border: `1px solid ${cat.border}`,
                    fontFamily: '"Plus Jakarta Sans", sans-serif',
                  }}
                >
                  {cat.label}
                </span>
              ))}
            </div>
          </div>

          {/* Planned personalisation variables */}
          <div>
            <p
              className="text-[11.5px] font-bold uppercase tracking-wide mb-3"
              style={{
                color: 'var(--color-muted-fg)',
                fontFamily: '"Plus Jakarta Sans", sans-serif',
                letterSpacing: '0.07em',
              }}
            >
              Planned personalisation variables
            </p>
            <div className="flex flex-wrap gap-2">
              {PLANNED_VARIABLES.map(({ tag, description }) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-mono px-2.5 py-1 rounded-none-none"
                  style={{
                    background: 'var(--color-muted)',
                    color: 'var(--color-primary)',
                    border: '1px solid var(--color-border)',
                  }}
                  title={description}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
