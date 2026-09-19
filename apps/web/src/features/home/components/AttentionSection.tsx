import React from 'react';
import { AttentionItemViewModel } from '../home.types';
import { AttentionItem } from './AttentionItem';

export interface AttentionSectionProps {
  items: AttentionItemViewModel[];
  isDegraded?: boolean;
}

export const AttentionSection: React.FC<AttentionSectionProps> = ({ items, isDegraded }) => {
  return (
    <section aria-labelledby="needs-attention-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="needs-attention-heading" className="text-lg font-semibold tracking-tight text-slate-900">
          Needs Attention
        </h2>
        {items.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>

      {isDegraded && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          <svg className="h-5 w-5 shrink-0 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <span>Some items requiring attention are temporarily unavailable.</span>
        </div>
      )}

      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <AttentionItem key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-6 text-center">
          <h3 className="text-sm font-semibold text-slate-900">You're caught up</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            Nothing currently requires your attention. Your active work is still available below.
          </p>
        </div>
      )}
    </section>
  );
};
