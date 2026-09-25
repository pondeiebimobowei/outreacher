import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsLayout,
});

export function SettingsLayout() {

  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-6xl mx-auto p-4 md:p-8">
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
