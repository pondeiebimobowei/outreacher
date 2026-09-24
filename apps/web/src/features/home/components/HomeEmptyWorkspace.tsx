import React from 'react';
import { Link } from '@tanstack/react-router';
import { Building2, Search, Users, Send } from 'lucide-react';

export const HomeEmptyWorkspace: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 sm:p-14 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-slate-100 text-slate-500 mb-2">
        <Building2 className="w-8 h-8 text-slate-500" strokeWidth={1.5} />
      </div>
      <h2
        className="mt-4 text-[22px] font-bold text-slate-900"
        style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
      >
        Start with a company
      </h2>
      <p
        className="mt-2 text-[14px] text-slate-600 max-w-md mx-auto leading-relaxed"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        Outreacher helps you turn a company you care about into an evidence-backed outreach opportunity. Add a target company to begin researching.
      </p>
      <div className="mt-6">
        <Link
          to="/companies"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-slate-900 px-6 py-2.5 text-[14px] font-semibold text-white shadow-xs hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          Add Company
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-xl mt-10 text-left">
        {[
          {
            icon: <Search className="w-4 h-4 text-indigo-600" />,
            title: 'Research',
            desc: 'Gather company signals and evidence before deciding to pursue.',
          },
          {
            icon: <Users className="w-4 h-4 text-purple-600" />,
            title: 'Identify contacts',
            desc: 'Find the right person — not just any person.',
          },
          {
            icon: <Send className="w-4 h-4 text-emerald-600" />,
            title: 'Reach out',
            desc: 'Send evidence-backed outreach grounded in research.',
          },
        ].map((step, i) => (
          <div
            key={i}
            className="rounded-xl p-4 border border-slate-200 bg-slate-50/50"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 bg-white border border-slate-200/80 shadow-2xs">
              {step.icon}
            </div>
            <p
              className="text-[13px] font-bold text-slate-900 mb-1"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {step.title}
            </p>
            <p
              className="text-[12px] text-slate-500 leading-relaxed"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              {step.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
