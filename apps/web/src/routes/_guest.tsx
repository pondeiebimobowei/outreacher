import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router';
import { useAuth } from '../lib/auth-context';
import { LoadingState } from '../components/states/LoadingState';

export const Route = createFileRoute('/_guest')({
  component: GuestLayoutComponent,
});

function GuestLayoutComponent() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <LoadingState message="Verifying session..." />
      </div>
    );
  }

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
        <Outlet />
      </div>
    </div>
  );
}
