import React from 'react';
import { RecentActivityItemViewModel } from '../home.types';
import { RecentActivityItem } from './RecentActivityItem';

export interface RecentActivityFeedProps {
  items: RecentActivityItemViewModel[];
  isDegraded?: boolean;
}

export const RecentActivityFeed: React.FC<RecentActivityFeedProps> = ({ items, isDegraded }) => {
  return (
    <section aria-labelledby="recent-activity-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2
          id="recent-activity-heading"
          className="text-[17px] font-bold tracking-tight text-slate-900"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          Recent Activity
        </h2>
        {items.length > 0 && (
          <span
            className="text-[12px] text-slate-400 font-medium"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            Chronological orientation
          </span>
        )}
      </div>

      {isDegraded && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[13px] text-amber-800 shadow-2xs"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          <svg className="h-5 w-5 shrink-0 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <span>Some recent activity is temporarily unavailable.</span>
        </div>
      )}

      {items.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
          <ul role="list" className="space-y-4">
            {items.map((item, idx) => (
              <RecentActivityItem
                key={item.id}
                item={item}
                isLast={idx === items.length - 1}
              />
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-xs">
          <p
            className="text-[13px] text-slate-500 max-w-md mx-auto leading-relaxed"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            No recent activity recorded yet. As research runs complete, contacts are selected, and emails are dispatched, records will appear here.
          </p>
        </div>
      )}
    </section>
  );
};
