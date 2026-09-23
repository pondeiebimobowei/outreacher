import React from 'react';
import { Link } from '@tanstack/react-router';
import { AlertCircle, FileText, Send, User } from 'lucide-react';
import { AttentionItemViewModel } from '../home.types';

export interface AttentionItemProps {
  item: AttentionItemViewModel;
}

const getIcon = (kind: string) => {
  switch (kind) {
    case 'OUTREACH_REVIEW': return <FileText className="w-5 h-5 text-amber-600" />;
    case 'SEND_FAILURE': return <AlertCircle className="w-5 h-5 text-rose-600" />;
    case 'needs-sender': return <Send className="w-5 h-5 text-amber-600" />;
    default: return <User className="w-5 h-5 text-blue-600" />;
  }
};

const getIconBg = (kind: string) => {
  switch (kind) {
    case 'OUTREACH_REVIEW': return 'bg-amber-100';
    case 'SEND_FAILURE': return 'bg-rose-100';
    case 'needs-sender': return 'bg-amber-100';
    default: return 'bg-blue-100';
  }
};

export const AttentionItem: React.FC<AttentionItemProps> = ({ item }) => {
  return (
    <div className="flex items-start justify-between rounded-xl border border-[var(--color-border)] bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-xl ${getIconBg(item.kind)}`}>
          {getIcon(item.kind)}
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted-fg)]">
              {item.companyName}
            </span>
          </div>
          <h3 className="text-base font-semibold text-[var(--color-primary)]">{item.title}</h3>
          <p className="text-sm text-[var(--color-muted-fg)] line-clamp-1">{item.description}</p>
        </div>
      </div>
      <div className="ml-4 flex-shrink-0 flex items-center h-full pt-2">
        <Link
          to={item.destination.to}
          params={item.destination.params}
          className="bg-[var(--color-primary)] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-gray-800 transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 inline-flex items-center justify-center"
        >
          {item.actionLabel}
        </Link>
      </div>
    </div>
  );
};
