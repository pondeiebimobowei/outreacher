import React from 'react';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';

export const HomePrimaryAction: React.FC = () => {
  return (
    <section
      aria-labelledby="start-workflow-heading"
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs transition-shadow hover:shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span
            className="text-[11px] font-bold uppercase tracking-wider text-indigo-600"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Start something new
          </span>
          <h2
            id="start-workflow-heading"
            className="text-[17px] font-bold text-slate-900 mt-0.5"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            Research a company
          </h2>
          <p
            className="text-[13.5px] text-slate-600 mt-1 max-w-xl leading-relaxed"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Begin the company-first workflow by adding a target company to evaluate openings, contacts, and evidence.
          </p>
        </div>
        <Link
          to="/companies"
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-5 py-2.5 text-[13px] font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          <Plus size={15} /> Add Company
        </Link>
      </div>
    </section>
  );
};
