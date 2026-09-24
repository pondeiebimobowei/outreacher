import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/_guest/signup')({
  component: () => <Navigate to="/login" search={{ mode: 'signup' }} replace />,
});
