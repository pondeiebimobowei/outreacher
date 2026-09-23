/* eslint-disable */
// @ts-nocheck
import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/opportunities')({
  component: () => <Outlet />,
});
