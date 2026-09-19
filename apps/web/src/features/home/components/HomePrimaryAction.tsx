import React from 'react';
import { Link } from '@tanstack/react-router';

export const HomePrimaryAction: React.FC = () => {
  return (
    <section aria-labelledby="start-workflow-heading" className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Start something new
          </span>
          <h2 id="start-workflow-heading" className="text-base font-semibold text-slate-900 mt-0.5">
            Research a company
          </h2>
          <p className="text-sm text-slate-600 mt-1 max-w-xl">
            Begin the company-first workflow by adding a target company to evaluate openings, contacts, and evidence.
          </p>
        </div>
        <Link
          to="/companies"
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Add Company
        </Link>
      </div>
    </section>
  );
};
