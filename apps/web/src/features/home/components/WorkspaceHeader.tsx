import React from 'react';
import { useAuth } from '../../../lib/auth-context';

export const WorkspaceHeader: React.FC = () => {
  const { user } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <header className="mb-8">
      <h1 
        className="text-3xl font-bold text-[var(--color-primary)]"
        style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
      >
        {getGreeting()}, {user?.name || user?.email?.split('@')[0] || 'there'}
      </h1>
      <p className="text-[var(--color-muted-fg)] mt-1">Here's your workspace overview.</p>
    </header>
  );
};
