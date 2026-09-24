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
    <div className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start gap-3.5 min-w-0">
        <div className={`p-2.5 rounded-xl shrink-0 ${getIconBg(item.kind)}`}>
          {getIcon(item.kind)}
        </div>
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-bold uppercase tracking-wider text-slate-500"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {item.companyName}
            </span>
          </div>
          <h3
            className="text-[15px] font-bold text-slate-900 truncate"
            style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
          >
            {item.title}
          </h3>
          <p
            className="text-[13px] text-slate-600 line-clamp-1 leading-relaxed"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {item.description}
          </p>
        </div>
      </div>
      <div className="ml-4 shrink-0 flex items-center h-full pt-1">
        <Link
          to={item.destination.to}
          params={item.destination.params}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-[13px] font-semibold text-white shadow-xs transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          style={{
            background: 'var(--color-primary)',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}
        >
          {item.actionLabel}
        </Link>
      </div>
    </div>
  );
};
