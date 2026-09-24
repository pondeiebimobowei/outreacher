import React from 'react';

export const HomeLoadingState: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading workspace summary">
      {/* Needs Attention Skeleton */}
      <section className="space-y-4">
        <div className="h-6 w-36 bg-slate-200 rounded-lg"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-32 rounded-xl border border-slate-200 bg-slate-100/70 p-5"></div>
          <div className="h-32 rounded-xl border border-slate-200 bg-slate-100/70 p-5"></div>
        </div>
      </section>

      {/* Primary Action Skeleton */}
      <div className="h-28 rounded-xl border border-slate-200 bg-slate-100/70 p-6"></div>

      {/* Continue Working Skeleton */}
      <section className="space-y-4">
        <div className="h-6 w-40 bg-slate-200 rounded-lg"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="h-36 rounded-xl border border-slate-200 bg-slate-100/70 p-5"></div>
          <div className="h-36 rounded-xl border border-slate-200 bg-slate-100/70 p-5"></div>
        </div>
      </section>

      {/* Recent Activity Skeleton */}
      <section className="space-y-4">
        <div className="h-6 w-32 bg-slate-200 rounded-lg"></div>
        <div className="h-44 rounded-xl border border-slate-200 bg-slate-100/70 p-5"></div>
      </section>
    </div>
  );
};
