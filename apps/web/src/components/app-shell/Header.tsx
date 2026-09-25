import { useState, useRef, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { MenuTwoLineIcon, SearchIcon, BellIcon, SettingsIcon, UserIcon, LogOutIcon } from '@hugeicons/core-free-icons';;
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../../lib/auth-context';

interface HeaderProps {
  onMenuClick: () => void;
  onOpenSearch: () => void;
}

export function Header({ onMenuClick, onOpenSearch }: HeaderProps) {
  const { user, workspace, logout } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or escape
  useEffect(() => {
    if (!profileOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileOpen]);

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
    navigate({ to: '/login' });
  };

  const initials = user?.firstName
    ? `${user.firstName[0] || ''}${user.lastName ? user.lastName[0] : ''}`.toUpperCase()
    : (user?.email?.[0] ?? 'U').toUpperCase();

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName}`.trim()
    : user?.email?.split('@')[0] || 'User';

  return (
    <header className="sticky top-0 z-20 flex h-[60px] w-full items-center justify-between border-b border-border bg-[rgba(247,247,245,0.92)] px-3 sm:px-6 backdrop-blur-sm shrink-0">
      {/* Mobile: Hamburger and Logo */}
      <div className="flex items-center gap-3 lg:hidden">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-10 w-10 items-center justify-center rounded-none-none text-[var(--color-foreground)] hover:bg-(--color-muted)  cursor-pointer"
          aria-label="Open navigation menu"
        >
          <HugeiconsIcon icon={MenuTwoLineIcon} size={20} className="lucide-menu" />
        </button>
        <span className="font-bold text-[15px] font-heading tracking-tight text-(--color-primary)">
          Outreacher
        </span>
      </div>

      {/* Desktop Search trigger button */}
      <div className="hidden sm:flex flex-1 max-w-xl">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex w-full items-center justify-between gap-2.5 rounded-none-none border border-border bg-(--color-card) px-3.5 py-2 text-left text-sm -2xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20  cursor-pointer group"
          aria-label="Search companies, contacts, campaigns... (⌘K)"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <HugeiconsIcon icon={SearchIcon} size={15} className="text-muted-fg group-hover:text-(--color-primary)  shrink-0" />
            <span className="text-[13px] text-muted-fg font-body truncate">
              Search companies, contacts, campaigns...
            </span>
          </div>
          <kbd className="hidden sm:inline-flex items-center rounded-none bg-(--color-muted) px-1.5 py-0.5 text-[10.5px] font-body text-muted-fg border border-border shrink-0">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1.5 sm:gap-3 ml-auto">
        {/* Mobile search icon button */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="sm:hidden flex h-10 w-10 items-center justify-center rounded-none-none text-[var(--color-foreground)] hover:bg-(--color-muted)  cursor-pointer"
          aria-label="Search"
        >
          <HugeiconsIcon icon={SearchIcon} size={18} />
        </button>

        {/* Notifications */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Notifications not yet available"
          className="relative flex h-10 w-10 items-center justify-center rounded-none-none text-muted-fg hover:text-(--color-primary) hover:bg-(--color-muted)  cursor-pointer"
          aria-label="Notifications"
        >
          <HugeiconsIcon icon={BellIcon} size={18} />
        </button>

        {/* User profile dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 p-1 rounded-none-none hover:bg-(--color-muted)  cursor-pointer"
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            aria-label="User profile menu"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-none-full text-indigo-700 text-xs font-bold text-white -xs font-heading">
              {initials}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-[13px] font-semibold leading-tight font-heading text-(--color-primary) truncate max-w-[120px]">
                {displayName}
              </p>
              <p className="text-[11px] leading-tight text-muted-fg font-body truncate max-w-[120px]">
                {workspace?.name || 'Workspace'}
              </p>
            </div>
          </button>

          {profileOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 origin-top-right rounded-none-none bg-slate-50 p-1  border border-border z-50 animate-in fade-in zoom-in-95 "
            >
              <div className="px-3 py-2 border-b border-border">
                <p className="truncate text-[13px] font-semibold text-(--color-primary) font-heading">
                  {displayName}
                </p>
                <p className="truncate text-[11px] text-muted-fg font-body">
                  {user?.email}
                </p>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    navigate({ to: '/settings' });
                  }}
                  className="flex w-full items-center gap-2.5 rounded-none-none px-3 py-2 text-left text-[13px] text-(--color-primary) hover:bg-(--color-muted) font-body  cursor-pointer min-h-[38px]"
                >
                  <HugeiconsIcon icon={SettingsIcon} size={15} className="text-muted-fg" />
                  <span>Settings</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    navigate({ to: '/settings/career-profile' });
                  }}
                  className="flex w-full items-center gap-2.5 rounded-none-none px-3 py-2 text-left text-[13px] text-(--color-primary) hover:bg-(--color-muted) font-body  cursor-pointer min-h-[38px]"
                >
                  <HugeiconsIcon icon={UserIcon} size={15} className="text-muted-fg" />
                  <span>Career Profile</span>
                </button>
              </div>

              <div className="border-t border-border pt-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-none-none px-3 py-2 text-left text-[13px] text-red-600 hover:bg-red-50 font-body  cursor-pointer min-h-[38px]"
                >
                  <HugeiconsIcon icon={LogOutIcon} size={15} className="text-red-500" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
