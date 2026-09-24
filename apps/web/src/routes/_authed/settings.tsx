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
        <h2
          className="text-[22px] font-bold tracking-tight mb-6 text-slate-900"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          Settings
        </h2>

        <nav className="space-y-7">
          {SETTINGS_NAVIGATION.map((group) => (
            <div key={group.title}>
              <h3
                className="text-[11px] font-bold uppercase tracking-wider mb-2 text-slate-400"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              >
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.links.map((link) => {
                  if (link.disabled) {
                    return (
                      <div
                        key={link.label}
                        className="flex items-center justify-between px-3 py-2 text-[13.5px] font-medium cursor-not-allowed opacity-50"
                        style={{ color: 'var(--color-muted-fg)', fontFamily: 'Inter, sans-serif' }}
                      >
                        <span>{link.label}</span>
                        <span
                          className="text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded font-mono"
                          style={{ background: 'var(--color-muted)', color: 'var(--color-muted-fg)' }}
                        >
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
                      className={`flex items-center px-3 py-2 text-[13.5px] rounded-lg transition-colors ${
                        isActive
                          ? 'font-semibold bg-slate-100 text-slate-900'
                          : 'font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                      style={{
                        fontFamily: 'Inter, sans-serif',
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
