import React from 'react';
import { RecentActivityItemViewModel } from '../home.types';

export interface RecentActivityItemProps {
  item: RecentActivityItemViewModel;
  isLast?: boolean;
}

export const RecentActivityItem: React.FC<RecentActivityItemProps> = ({ item, isLast }) => {
  return (
    <li className="relative flex gap-x-4">
      {/* Timeline line */}
      {!isLast && (
        <div
          className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-200"
          aria-hidden="true"
        />
      )}
      {/* Timeline dot */}
      <div
        className="w-6 h-6 rounded-none-full flex items-center justify-center shrink-0 mt-0.5 relative z-10 bg-slate-100 border border-slate-200"
        aria-hidden="true"
      >
        <span className="w-1.5 h-1.5 rounded-none-full bg-indigo-600" />
      </div>
      <div className="flex-auto pb-4">
        <div className="flex items-baseline justify-between gap-x-4">
          <h3
            className="text-[13.5px] font-semibold leading-snug text-slate-900"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            {item.title}
          </h3>
          <time
            dateTime={item.occurredAt}
            className="flex-none text-[12px] font-medium text-slate-400"
            style={{ fontFamily: 'sans-serif' }}
          >
            {item.relativeTime}
          </time>
        </div>
        <p
          className="mt-0.5 text-[13px] text-slate-600 leading-relaxed"
          style={{ fontFamily: 'sans-serif' }}
        >
          {item.description}
        </p>
      </div>
    </li>
  );
};
