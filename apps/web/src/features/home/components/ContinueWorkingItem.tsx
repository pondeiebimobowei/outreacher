import React from 'react';
import { Link } from '@tanstack/react-router';
import { ContinueWorkingItemViewModel } from '../home.types';

export interface ContinueWorkingItemProps {
  item: ContinueWorkingItemViewModel;
}

export const ContinueWorkingItem: React.FC<ContinueWorkingItemProps> = ({ item }) => {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-slate-300 hover:shadow-sm">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide border ${item.badgeClasses}`}
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            {item.badgeLabel}
          </span>
          {item.campaignName && (
            <span
              className="text-[12px] font-medium text-slate-500 truncate max-w-[180px]"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {item.campaignName}
            </span>
          )}
        </div>
        <h3
          className="text-[16px] font-bold text-slate-900"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          {item.companyName}
        </h3>
        <p
          className="text-[12.5px] font-medium text-slate-500"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {item.stateLabel}
        </p>
        <p
          className="text-[13px] text-slate-600 leading-relaxed"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          <span className="font-semibold text-slate-800">Next:</span> {item.nextActionLabel}
        </p>
      </div>
      <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-end">
        <Link
          to={item.destination.to}
          params={item.destination.params}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          {item.actionLabel}
        </Link>
      </div>
    </div>
  );
};
