import React, { useState, useEffect } from 'react';
import { useRouterState, Navigate } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../lib/auth-context';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const routerState = useRouterState();

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [routerState.location.pathname]);

  // Command K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--color-background)] font-[family-name:var(--font-body)]">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block shrink-0">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex w-64 max-w-xs flex-1 flex-col bg-[var(--color-sidebar)] pt-5 pb-4">
            <Sidebar collapsed={false} onToggle={() => setMobileNavOpen(false)} onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header 
          onMenuClick={() => setMobileNavOpen(true)} 
          onOpenSearch={() => setPaletteOpen(true)} 
        />
        
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 outline-none">
          {children}
        </main>
      </div>

      {/* Placeholder for Command Palette */}
      {paletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24">
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" 
            onClick={() => setPaletteOpen(false)} 
          />
          <div className="relative w-full max-w-xl rounded-xl bg-white shadow-2xl overflow-hidden m-4">
            <div className="p-4 border-b border-[var(--color-border)]">
              <input 
                autoFocus
                placeholder="Search anything..." 
                className="w-full bg-transparent text-lg outline-none text-[var(--color-foreground)]"
              />
            </div>
            <div className="p-4 text-center text-sm text-[var(--color-muted-fg)]">
              Search not implemented yet. Press Esc to close.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
