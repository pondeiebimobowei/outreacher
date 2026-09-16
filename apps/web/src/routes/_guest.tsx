import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_guest')({
  component: GuestLayoutComponent,
});

function GuestLayoutComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
        <Outlet />
      </div>
    </div>
  );
}
