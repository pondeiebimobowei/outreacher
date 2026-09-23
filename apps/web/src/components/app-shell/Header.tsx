import { useState } from 'react';
import { Menu, Search, Bell } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../../lib/auth-context';

interface HeaderProps {
  onMenuClick: () => void;
  onOpenSearch: () => void;
}

export function Header({ onMenuClick, onOpenSearch }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate({ to: '/login' });
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    }
    if (email) {
      return email.charAt(0).toUpperCase();
    }
    return 'U';
  };

  return (
    <header className="sticky top-0 z-20 flex h-[60px] w-full items-center justify-between border-b border-[var(--color-border)] bg-[rgba(247,247,245,0.92)] px-4 backdrop-blur-sm">
      <div className="flex items-center gap-4 lg:hidden">
        <button
          onClick={onMenuClick}
          className="flex h-10 w-10 items-center justify-center rounded-md text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
        >
          <Menu size={20} />
        </button>
        <span className="font-[family-name:var(--font-sans)] font-semibold text-[var(--color-primary)]">
          Outreacher
        </span>
      </div>

      {/* Spacer for mobile */}
      <div className="hidden lg:block w-4"></div>

      <div className="flex flex-1 justify-center sm:justify-start lg:px-4 max-w-2xl">
        <button
          onClick={onOpenSearch}
          className="hidden sm:flex h-9 w-full max-w-md items-center justify-between rounded-md border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-muted-fg)] shadow-sm hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
        >
          <div className="flex items-center gap-2">
            <Search size={16} />
            <span>Search companies, contacts, campaigns...</span>
          </div>
          <kbd className="hidden rounded bg-[var(--color-muted)] px-1.5 py-0.5 font-sans text-xs font-medium text-[var(--color-muted-fg)] sm:inline-block">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <button
          onClick={onOpenSearch}
          className="flex h-10 w-10 sm:hidden items-center justify-center rounded-md text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
        >
          <Search size={20} />
        </button>

        <button className="relative flex h-10 w-10 items-center justify-center rounded-md text-[var(--color-foreground)] hover:bg-[var(--color-muted)]">
          <Bell size={20} />
          {/* <span className="absolute right-2 top-2 flex h-2 w-2 rounded-full bg-red-500"></span> */}
        </button>

        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-medium text-indigo-700 hover:ring-2 hover:ring-indigo-500 hover:ring-offset-2 focus:outline-none transition-all"
          >
            {getInitials(user?.name || undefined, user?.email)}
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 z-50">
              <div className="border-b border-[var(--color-border)] px-4 py-2">
                <p className="truncate text-sm font-medium text-[var(--color-foreground)]">
                  {user?.name || 'User'}
                </p>
                <p className="truncate text-xs text-[var(--color-muted-fg)]">
                  {user?.email}
                </p>
              </div>
              <button
                onClick={() => { setProfileOpen(false); navigate({ to: '/settings' }); }}
                className="block w-full px-4 py-2 text-left text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"
              >
                Settings
              </button>
              <button
                onClick={() => { setProfileOpen(false); handleLogout(); }}
                className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
