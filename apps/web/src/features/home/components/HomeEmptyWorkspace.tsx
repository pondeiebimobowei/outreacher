import React from 'react';
import { Link } from '@tanstack/react-router';

export const HomeEmptyWorkspace: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 sm:p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
          />
        </svg>
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-900">Start with a company</h2>
      <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
        Outreacher helps you turn a company you care about into an evidence-backed outreach opportunity. Add a target company to begin researching.
      </p>
      <div className="mt-6">
        <Link
          to="/companies"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Add Company
        </Link>
      </div>
    </div>
  );
};
