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

  const displayName = user?.name || user?.email?.split('@')[0] || 'there';

  return (
    <header className="border-b border-slate-200 pb-5">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {getGreeting()}, {displayName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {workspace ? (
              <>
                Active workspace: <span className="font-semibold text-slate-800">{workspace.name}</span>
              </>
            ) : (
              'Your workspace orientation and continuation surface.'
            )}
          </p>
        </div>
      </div>
    </header>
  );
};
