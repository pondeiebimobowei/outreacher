import React from 'react';
import { ContinueWorkingItemViewModel } from '../home.types';
import { ContinueWorkingItem } from './ContinueWorkingItem';

export interface ContinueWorkingSectionProps {
  items: ContinueWorkingItemViewModel[];
  isDegraded?: boolean;
}

export const ContinueWorkingSection: React.FC<ContinueWorkingSectionProps> = ({ items, isDegraded }) => {
  return (
    <section aria-labelledby="continue-working-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2
          id="continue-working-heading"
          className="text-[17px] font-bold tracking-tight text-slate-900"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          Continue Working
        </h2>
        {items.length > 0 && (
          <span
            className="inline-flex items-center rounded-none-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            {items.length} active
          </span>
        )}
      </div>

      {isDegraded && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-none-none border border-amber-200 bg-amber-50 p-3.5 text-[13px] text-amber-800 -2xs"
          style={{ fontFamily: 'sans-serif' }}
        >
          <svg className="h-5 w-5 shrink-0 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <span>Some active work items are temporarily unavailable.</span>
        </div>
      )}

      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <ContinueWorkingItem key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="rounded-none-none border border-slate-200 bg-slate-50 p-6 text-center -xs">
          <h3
            className="text-[15px] font-bold text-slate-900"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            No active work in progress
          </h3>
          <p
            className="mt-1 text-[13px] text-slate-500 max-w-md mx-auto"
            style={{ fontFamily: 'sans-serif' }}
          >
            When you research companies or schedule campaigns, they will appear here for easy continuation.
          </p>
        </div>
      )}
    </section>
  );
};
