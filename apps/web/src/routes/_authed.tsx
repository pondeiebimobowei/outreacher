import { createFileRoute, Link, Navigate, Outlet } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { LoadingState } from '../components/states/LoadingState';
import { ProfileBanner } from '../components/profile-banner';

export const Route = createFileRoute('/_authed')({
  component: AuthedLayoutComponent,
});

function AuthedLayoutComponent() {
  const { status, user, workspace, logout, retryBootstrap, error } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingState message="Resolving authenticated session..." />
      </div>
    );
  }

  if (status === 'bootstrap_error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-xs text-center">
          <div className="mb-3 text-red-600 font-semibold text-lg">Connection Error</div>
          <p className="text-sm text-slate-600 mb-4">
            {error?.message || 'Unable to connect to the authentication service.'}
          </p>
          <button
            type="button"
            onClick={() => void retryBootstrap()}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-slate-800"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile Sticky Top App Bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900 tracking-tight text-lg">Outreacher</span>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
            MVP
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-drawer"
          className="flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
      </header>

      {/* Mobile Navigation Drawer Sheet */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
            data-testid="mobile-backdrop"
          />

          {/* Drawer content */}
          <aside
            id="mobile-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation Menu"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xs flex-col justify-between bg-white p-4 shadow-xl sm:max-w-sm"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 tracking-tight text-lg">Outreacher</span>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                    MVP
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Active Workspace Info in Mobile Drawer */}
              {workspace && (
                <div className="mb-4 px-3 py-2 rounded bg-slate-50 border border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    Workspace
                  </span>
                  <span className="text-sm font-medium text-slate-900 truncate block">
                    {workspace.name}
                  </span>
                </div>
              )}

              {/* Mobile Navigation Links */}
              <nav className="space-y-1">
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-[44px] items-center px-3 py-2.5 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  activeProps={{ className: 'bg-slate-100 text-slate-900 font-semibold' }}
                >
                  Home
                </Link>
                <Link
                  to="/companies"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-[44px] items-center px-3 py-2.5 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  activeProps={{ className: 'bg-slate-100 text-slate-900 font-semibold' }}
                >
                  Companies
                </Link>
                <div className="flex min-h-[44px] items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-400 cursor-not-allowed">
                  <span>Campaigns</span>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                    Soon
                  </span>
                </div>
                <div className="flex min-h-[44px] items-center justify-between px-3 py-2.5 text-sm font-medium text-slate-400 cursor-not-allowed">
                  <span>Templates</span>
                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                    Soon
                  </span>
                </div>
                <Link
                  to="/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex min-h-[44px] items-center px-3 py-2.5 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  activeProps={{ className: 'bg-slate-100 text-slate-900 font-semibold' }}
                >
                  Settings
                </Link>
              </nav>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="mb-2 px-3">
                <span className="text-xs text-slate-500 block truncate">{user.email}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void logout();
                }}
                className="flex min-h-[44px] w-full items-center text-left px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md"
              >
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Structural Sidebar Shell (Tablet w-52, Desktop w-64) */}
      <aside className="hidden md:flex md:w-52 lg:w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-3 lg:p-4">
        <div>
          <div className="flex items-center gap-2 px-2 py-3 mb-6 border-b border-slate-100">
            <span className="font-bold text-slate-900 tracking-tight text-lg">Outreacher</span>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
              MVP
            </span>
          </div>

          {/* Active Workspace Info */}
          {workspace && (
            <div className="mb-4 px-2 py-2 rounded bg-slate-50 border border-slate-200">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Workspace
              </span>
              <span className="text-sm font-medium text-slate-900 truncate block">
                {workspace.name}
              </span>
            </div>
          )}

          <nav className="space-y-1">
            <Link
              to="/"
              className="flex min-h-[44px] lg:min-h-[36px] items-center px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              activeProps={{ className: 'bg-slate-100 text-slate-900 font-semibold' }}
            >
              Home
            </Link>
            <Link
              to="/companies"
              className="flex min-h-[44px] lg:min-h-[36px] items-center px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              activeProps={{ className: 'bg-slate-100 text-slate-900 font-semibold' }}
            >
              Companies
            </Link>
            <div className="flex min-h-[44px] lg:min-h-[36px] items-center justify-between px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed">
              <span>Campaigns</span>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                Soon
              </span>
            </div>
            <div className="flex min-h-[44px] lg:min-h-[36px] items-center justify-between px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed">
              <span>Templates</span>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                Soon
              </span>
            </div>
            <Link
              to="/settings"
              className="flex min-h-[44px] lg:min-h-[36px] items-center px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              activeProps={{ className: 'bg-slate-100 text-slate-900 font-semibold' }}
            >
              Settings
            </Link>
          </nav>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <div className="mb-2 px-3">
            <span className="text-xs text-slate-500 block truncate">{user.email}</span>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex min-h-[44px] lg:min-h-[36px] w-full items-center text-left px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area Container */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 min-w-0">
        <ProfileBanner />
        <Outlet />
      </main>
    </div>
  );
}
