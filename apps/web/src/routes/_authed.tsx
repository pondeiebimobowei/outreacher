import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router';
import { useAuth } from '../lib/auth-context';
import { LoadingState } from '../components/states/LoadingState';
import { ProfileBanner } from '../components/profile-banner';
import { AppShell } from '../components/app-shell/AppShell';

export const Route = createFileRoute('/_authed')({
  component: AuthedLayoutComponent,
});

function AuthedLayoutComponent() {
  const { status, error, retryBootstrap } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--color-background)">
        <LoadingState message="Resolving authenticated session..." />
      </div>
    );
  }
  if (status === 'bootstrap_error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--color-background) p-4">
        <div className="w-full max-w-md rounded-none-none border border-red-200 bg-slate-50 p-6 -xs text-center">
          <div className="mb-3 text-red-600 font-semibold text-lg">Connection Error</div>
          <p className="text-sm text-slate-600 mb-4">
            {error?.message || 'Unable to connect to the authentication service.'}
          </p>
          <button
            type="button"
            onClick={() => void retryBootstrap()}
            className="w-full rounded-none-none bg-slate-900 px-4 py-2 text-sm font-semibold text-white -xs hover:bg-slate-800"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <ProfileBanner />
        <Outlet />
      </div>
    </AppShell>
  );
}
