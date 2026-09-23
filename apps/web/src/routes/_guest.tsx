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
      <div className="flex min-h-screen items-center justify-center p-4 bg-[var(--color-background)]">
        <LoadingState message="Verifying session..." />
      </div>
    );
  }

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex bg-[var(--color-background)]">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[400px] shrink-0 p-10 bg-[var(--color-sidebar)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md flex items-center justify-center bg-[var(--color-accent)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" />
            </svg>
          </div>
          <span className="font-bold text-white text-[17px] tracking-tight font-heading">
            Outreacher
          </span>
        </div>

        <div>
          <p className="text-[28px] font-bold text-white leading-snug font-heading">
            Career outreach,<br />done deliberately.
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-sidebar-fg)]">
            Research companies, identify the right contacts, and send outreach grounded in evidence — not guesswork.
          </p>
        </div>

        <p className="text-[12px] text-[var(--color-sidebar-fg)] opacity-50">
          Outreacher v1.0
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        <div className="w-full max-w-[440px] bg-[var(--color-card)] rounded-xl shadow-sm border border-[var(--color-border)] p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
