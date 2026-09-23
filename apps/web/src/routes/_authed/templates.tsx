import { createFileRoute } from '@tanstack/react-router';
import { FileText } from 'lucide-react';

export const Route = createFileRoute('/_authed/templates')({
  component: TemplatesPlaceholderComponent,
});

function TemplatesPlaceholderComponent() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 
          className="text-3xl font-bold text-[var(--color-primary)]"
          style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
        >
          Templates
        </h1>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 py-24 px-8 border border-[var(--color-border)] rounded-xl bg-white shadow-sm mt-8">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gray-100 text-gray-400">
          <FileText className="w-6 h-6" />
        </div>
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold mb-2 text-[var(--color-primary)]" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
            Templates are coming soon
          </h2>
          <p className="text-sm leading-relaxed text-[var(--color-muted-fg)]">
            Create reusable templates for your campaigns to standardise your outreach messages across different target companies and roles.
          </p>
        </div>
      </div>
    </div>
  );
}
