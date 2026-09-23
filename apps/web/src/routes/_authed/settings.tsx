import { createFileRoute, Outlet, Link, useLocation } from '@tanstack/react-router';
import { SETTINGS_NAVIGATION } from '../../lib/settings-navigation';

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsLayout,
});

export function SettingsLayout() {
  const location = useLocation();

  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-6xl mx-auto p-4 md:p-8">
      {/* Settings Navigation */}
      <aside className="w-full md:w-56 lg:w-64 shrink-0">
        <h2 className="text-[20px] font-bold tracking-tight mb-6" style={{ color: 'var(--color-primary)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          Settings
        </h2>
        
        <nav className="space-y-8">
          {SETTINGS_NAVIGATION.map((group) => (
            <div key={group.title}>
              <h3 className="text-[12px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--color-muted-fg)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.links.map((link) => {
                  if (link.disabled) {
                    return (
                      <div
                        key={link.label}
                        className="flex items-center justify-between px-3 py-2 text-[14px] font-medium cursor-not-allowed opacity-60"
                        style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}
                      >
                        <span>{link.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--color-muted)', color: 'var(--color-muted-fg)' }}>
                          Soon
                        </span>
                      </div>
                    );
                  }

                  const isActive = location.pathname.startsWith(link.to);

                  return (
                    <Link
                      key={link.label}
                      to={link.to}
                      className={`flex items-center px-3 py-2 text-[14px] rounded-lg transition-colors ${
                        isActive 
                          ? 'font-semibold' 
                          : 'font-medium'
                      }`}
                      style={{
                        background: isActive ? 'var(--color-muted)' : 'transparent',
                        color: isActive ? 'var(--color-primary)' : 'var(--color-muted-fg)',
                        fontFamily: 'Inter, sans-serif'
                      }}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
