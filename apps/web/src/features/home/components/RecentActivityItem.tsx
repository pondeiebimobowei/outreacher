import React from 'react';
import { RecentActivityItemViewModel } from '../home.types';

export interface RecentActivityItemProps {
  item: RecentActivityItemViewModel;
}

export const RecentActivityItem: React.FC<RecentActivityItemProps> = ({ item }) => {
  return (
    <li className="relative flex gap-x-4 py-3 sm:py-3.5">
      <div className="flex-auto">
        <div className="flex items-baseline justify-between gap-x-4">
          <h3 className="text-sm font-semibold leading-6 text-slate-900">{item.title}</h3>
          <time
            dateTime={item.occurredAt}
            className="flex-none text-xs font-medium text-slate-400"
          >
            {item.relativeTime}
          </time>
        </div>
        <p className="mt-0.5 text-sm text-slate-600 leading-relaxed">{item.description}</p>
      </div>
    </li>
  );
};
