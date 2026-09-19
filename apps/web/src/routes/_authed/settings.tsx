import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsLayout,
});

export function SettingsLayout() {
  return <Outlet />;
}
