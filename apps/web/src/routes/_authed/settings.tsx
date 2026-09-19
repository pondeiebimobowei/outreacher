import { createFileRoute, Outlet, Link, useLocation } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/settings')({
  component: SettingsLayout,
});

export function SettingsLayout() {
  const location = useLocation();

  const navGroups = [
    {
      title: 'Account',
      links: [
        { label: 'Profile', to: '/settings/profile', disabled: true },
        { label: 'Career profile', to: '/settings/career-profile', disabled: false },
      ],
    },
    {
      title: 'Communication',
      links: [
        { label: 'Sender accounts', to: '/settings/senders', disabled: true },
        { label: 'Integrations', to: '/settings/integrations', disabled: false },
        { label: 'Notifications', to: '/settings/notifications', disabled: true },
      ],
    },
    {
      title: 'Preferences',
      links: [
        { label: 'Appearance', to: '/settings/appearance', disabled: true },
        { label: 'Timezone', to: '/settings/timezone', disabled: true },
        { label: 'Workflow preferences', to: '/settings/workflow', disabled: true },
      ],
    },
    {
      title: 'Security',
      links: [
        { label: 'Password', to: '/settings/password', disabled: true },
        { label: 'Sessions', to: '/settings/sessions', disabled: true },
      ],
    }
  ];

  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-6xl mx-auto">
      {/* Settings Navigation */}
      <aside className="w-full md:w-56 lg:w-64 shrink-0">
        <h2 className="text-xl font-bold tracking-tight text-slate-900 mb-6">Settings</h2>
        
        <nav className="space-y-8">
          {navGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.links.map((link) => {
                  if (link.disabled) {
                    return (
                      <div
                        key={link.label}
                        className="flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-400 cursor-not-allowed"
                      >
                        <span>{link.label}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">
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
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                        isActive 
                          ? 'bg-slate-100 text-slate-900 font-semibold' 
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                      }`}
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
      <div className="flex-1 min-w-0 bg-white md:bg-transparent rounded-lg md:rounded-none md:shadow-none shadow-sm md:p-0 p-4 border md:border-0 border-slate-200">
        <Outlet />
      </div>
    </div>
  );
}
