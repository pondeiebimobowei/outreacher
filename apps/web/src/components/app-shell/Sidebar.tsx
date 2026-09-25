import { Link, useRouterState } from '@tanstack/react-router';
import { HugeiconsIcon } from '@hugeicons/react';
import { ChevronLeftIcon, ChevronRightIcon, HelpCircleIcon } from '@hugeicons/core-free-icons';
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
    <aside
      role="complementary"
      className="flex h-full flex-col bg-(--color-sidebar) text-sidebar-fg   z-30 select-none"
      style={{ width: collapsed ? '64px' : '220px' }}
    >
      {/* Brand row */}
      <div className="flex h-[60px] items-center justify-between border-b border-sidebar-hover px-4 shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
          <div className="w-7 h-7 rounded-none flex items-center justify-center shrink-0 bg-accent">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" />
            </svg>
          </div>
          {!collapsed && (
            <span className="font-bold text-white text-[15px] tracking-tight font-heading truncate">
              Outreacher
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex h-7 w-7 items-center justify-center rounded-nonoe text-sidebar-fg hover:bg-sidebar-hover hover:text-white  cursor-pointer shrink-0"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <HugeiconsIcon icon={ChevronRightIcon} size={16} /> : <HugeiconsIcon icon={ChevronLeftIcon} size={16} />}
        </button>
      </div>

      {/* Workspace identity */}
      <div className="border-b border-sidebar-hover p-2.5 shrink-0">
        {collapsed ? (
          <div
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-none bg-[rgba(255,255,255,0.08)] font-bold text-white/80 text-[11px] tracking-wider font-heading"
            title={`Workspace: ${workspace?.name || 'Workspace'}`}
          >
            {workspaceInitials}
          </div>
        ) : (
          <div className="flex w-full items-center gap-2.5 rounded-none px-2.5 py-2 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgba(255,255,255,0.12)] font-bold text-white text-[10px] tracking-tight font-heading">
              {workspaceInitials}
            </div>
            <div className="flex flex-col overflow-hidden min-w-0 flex-1">
              <span className="truncate text-[12.5px] font-semibold text-white/90 font-heading">
                {workspace?.name || 'Workspace'}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-sidebar-fg/70 font-body">
                Active Workspace
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Primary navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {primaryNav.map((item) => {
          const active = isActive(item.to, item.exact);
          return (
            <Link
              key={item.id}
              to={item.to}
              onClick={onNavigate}
              className={`group relative flex min-h-11 w-full items-center gap-3 rounded-none px-2.5 py-2 text-left  ${active
                ? 'bg-[rgba(255,255,255,0.1)] text-white font-semibold'
                : 'text-sidebar-fg hover:bg-sidebar-hover hover:text-white'
                }`}
              title={collapsed ? item.label : undefined}
            >
              {active && (
                <div className="absolute left-0 top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-none bg-accent" />
              )}

              <HugeiconsIcon
                icon={item.icon}
                size={17}
                className={`shrink-0  ${active ? 'text-white' : 'text-sidebar-fg group-hover:text-white'
                  }`}
              />
              {!collapsed && (
                <span className="truncate font-heading text-[13.5px]">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom navigation */}
      <div className="shrink-0 border-t border-sidebar-hover px-2 py-3 space-y-1">
        {bottomNav.map((item) => {
          const active = isActive(item.to, item.exact);
          return (
            <Link
              key={item.id}
              to={item.to}
              onClick={onNavigate}
              className={`group relative flex min-h-11 w-full items-center gap-3 rounded-none px-2.5 py-2 text-left  ${active
                ? 'bg-[rgba(255,255,255,0.1)] text-white font-semibold'
                : 'text-sidebar-fg hover:bg-sidebar-hover hover:text-white'
                }`}
              title={collapsed ? item.label : undefined}
            >
              {active && (
                <div className="absolute left-0 top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-none bg-accent" />
              )}
              <HugeiconsIcon
                icon={item.icon}
                size={17}
                className={`shrink-0  ${active ? 'text-white' : 'text-sidebar-fg group-hover:text-white'
                  }`}
              />
              {!collapsed && (
                <span className="truncate font-heading text-[13.5px]">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
        <div
          className="group flex min-h-11 w-full items-center gap-3 rounded-none px-2.5 py-2 text-left opacity-50 cursor-not-allowed select-none"
          title={collapsed ? 'Help & Documentation' : undefined}
        >
          <HugeiconsIcon icon={HelpCircleIcon} size={17} className="shrink-0 text-sidebar-fg" />
          {!collapsed && (
            <span className="truncate font-heading text-[13.5px]">
              Help
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
