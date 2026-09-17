import { createFileRoute, Link, Navigate, Outlet } from '@tanstack/react-router';
import { useAuth } from '../lib/auth-context';
import { LoadingState } from '../components/states/LoadingState';
import { ProfileBanner } from '../components/profile-banner';

export const Route = createFileRoute('/_authed')({
  component: AuthedLayoutComponent,
});

function AuthedLayoutComponent() {
  const { status, user, workspace, logout, retryBootstrap, error } = useAuth();

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
    <div className="flex min-h-screen">
      {/* Structural Sidebar Shell */}
      <aside className="w-64 border-r border-slate-200 bg-white p-4 hidden md:flex flex-col justify-between">
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
              className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              activeProps={{ className: 'bg-slate-100 text-slate-900 font-semibold' }}
            >
              Home
            </Link>
            <Link
              to="/companies"
              className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              activeProps={{ className: 'bg-slate-100 text-slate-900 font-semibold' }}
            >
              Companies
            </Link>
            <div className="flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed">
              <span>Campaigns</span>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                Soon
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed">
              <span>Templates</span>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                Soon
              </span>
            </div>
            <Link
              to="/settings"
              className="flex items-center px-3 py-2 text-sm font-medium rounded-md text-slate-700 hover:bg-slate-50 hover:text-slate-900"
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
            className="w-full text-left px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area Container */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        <ProfileBanner />
        <Outlet />
      </main>
    </div>
  );
}
