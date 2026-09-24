import React from 'react';
import { useAuth } from '../../../lib/auth-context';

export const WorkspaceHeader: React.FC = () => {
  const { user, workspace } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <header className="mb-8">
      <h1
        className="text-[26px] font-bold tracking-tight text-slate-900"
        style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
      >
        {getGreeting()}, {user?.name || user?.email?.split('@')[0] || 'there'}
      </h1>
      <p
        className="text-[14px] text-slate-500 mt-1"
        style={{ fontFamily: 'Inter, sans-serif' }}
      >
        Here's your workspace overview
        {workspace?.name ? (
          <>
            {' '}
            &mdash;{' '}
            <span className="text-slate-700 font-medium">{workspace.name}</span>
          </>
        ) : null}
        .
      </p>
    </header>
  );
};
