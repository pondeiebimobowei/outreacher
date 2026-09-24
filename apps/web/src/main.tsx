import React from 'react';
import { createRoot } from 'react-dom/client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { routeTree } from './routeTree.gen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { queryClient } from './config/query';
import { AuthProvider } from './lib/auth-context';
import './index.css';

// WORKAROUND: Prevent Phantom Wallet from silently swallowing React 19 errors.
// Phantom injects a `process` EventEmitter which tricks React 19's error reporter
// into using `process.emit('uncaughtException')` instead of `console.error`.
if (
  typeof window !== 'undefined' &&
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).process &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (window as any).process.emit === 'function' &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  !(window as any).process.env
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).process;
}

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const el = document.getElementById('root');
if (el) {
  const root = createRoot(el);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
} else {
  throw new Error('Could not find root element');
}
