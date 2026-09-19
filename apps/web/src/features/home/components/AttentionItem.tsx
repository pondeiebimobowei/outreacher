import React from 'react';
import { Link } from '@tanstack/react-router';
import { AttentionItemViewModel } from '../home.types';

export interface AttentionItemProps {
  item: AttentionItemViewModel;
}

export const AttentionItem: React.FC<AttentionItemProps> = ({ item }) => {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 sm:p-5 shadow-xs transition-shadow hover:shadow-sm">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${item.badgeClasses}`}
          >
            {item.badgeLabel}
          </span>
          <span className="text-xs font-medium text-slate-500 truncate max-w-[200px]">
            {item.companyName}
          </span>
        </div>
        <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
        <p className="text-sm text-slate-600 leading-relaxed">{item.description}</p>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end">
        <Link
          to={item.destination.to}
          params={item.destination.params}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          {item.actionLabel}
        </Link>
      </div>
    </div>
  );
};
