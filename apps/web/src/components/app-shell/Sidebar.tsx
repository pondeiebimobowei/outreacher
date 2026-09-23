import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { primaryNav, bottomNav } from '../../lib/nav';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const { workspace } = useAuth();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const isActive = (to: string, exact?: boolean) => {
    if (exact) return pathname === to;
    return pathname.startsWith(to);
  };

  const workspaceInitials = workspace?.name?.substring(0, 2).toUpperCase() || 'WS';

  return (
    <div
      role="complementary" className="flex h-full flex-col bg-[var(--color-sidebar)] text-[var(--color-sidebar-fg)] transition-all duration-300 z-30"
      style={{ width: collapsed ? '64px' : '220px' }}
    >
      {/* Logo row */}
      <div className="flex h-[60px] items-center justify-between border-b border-[rgba(255,255,255,0.07)] px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white font-bold">
            O
          </div>
          {!collapsed && (
            <span className="font-[family-name:var(--font-sans)] font-semibold text-white tracking-wide">
              Outreacher
            </span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-[var(--color-sidebar-hover)] hover:text-white transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center py-3 border-b border-[rgba(255,255,255,0.07)]">
           <button
            onClick={onToggle}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--color-sidebar-hover)] hover:text-white transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Workspace identity */}
      <div className="flex items-center border-b border-[rgba(255,255,255,0.07)] p-4 h-[72px]">
        {collapsed ? (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-[rgba(255,255,255,0.1)] font-medium text-white text-xs">
            {workspaceInitials}
          </div>
        ) : (
          <div className="flex w-full items-center gap-3 rounded-md p-1.5 hover:bg-[var(--color-sidebar-hover)] cursor-pointer transition-colors">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[rgba(255,255,255,0.1)] font-medium text-white text-xs">
              {workspaceInitials}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-medium text-white">
                {workspace?.name || 'Workspace'}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-sidebar-fg)]">
                Pro Plan
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Primary nav */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {primaryNav.map((item) => {
          const active = isActive(item.to, item.exact);
          return (
            <Link
              key={item.id}
              to={item.to}
              onClick={onNavigate}
              className={`group relative flex min-h-[44px] w-full items-center gap-3 rounded-md px-2.5 py-[10px] lg:py-2 text-left transition-all ${
                active
                  ? 'bg-[rgba(255,255,255,0.1)] text-white'
                  : 'hover:bg-[var(--color-sidebar-hover)] hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
            >
              {active && (
                <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-md bg-indigo-500" />
              )}
              <item.icon size={18} className="shrink-0" />
              {!collapsed && (
                <span className="truncate font-[family-name:var(--font-sans)] text-[13.5px] font-medium">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Bottom nav */}
      <div className="shrink-0 border-t border-[rgba(255,255,255,0.07)] px-2 py-3 space-y-1">
        {bottomNav.map((item) => {
          const active = isActive(item.to, item.exact);
          return (
            <Link
              key={item.id}
              to={item.to}
              onClick={onNavigate}
              className={`group relative flex min-h-[44px] w-full items-center gap-3 rounded-md px-2.5 py-[10px] lg:py-2 text-left transition-all ${
                active
                  ? 'bg-[rgba(255,255,255,0.1)] text-white'
                  : 'hover:bg-[var(--color-sidebar-hover)] hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
            >
              {active && (
                <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-md bg-indigo-500" />
              )}
              <item.icon size={18} className="shrink-0" />
              {!collapsed && (
                <span className="truncate font-[family-name:var(--font-sans)] text-[13.5px] font-medium">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
        <div
          className="group flex min-h-[44px] w-full items-center gap-3 rounded-md px-2.5 py-[10px] lg:py-2 text-left opacity-50 cursor-not-allowed"
          title={collapsed ? 'Help' : undefined}
        >
          <HelpCircle size={18} className="shrink-0" />
          {!collapsed && (
            <span className="truncate font-[family-name:var(--font-sans)] text-[13.5px] font-medium">
              Help
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
