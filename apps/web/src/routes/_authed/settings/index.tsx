import { createFileRoute, Link } from '@tanstack/react-router';
import { SETTINGS_NAVIGATION } from '../../../lib/settings-navigation';

export const Route = createFileRoute('/_authed/settings/')({
  component: SettingsLandingPage,
});

export function SettingsLandingPage() {
  return (
    <div className="max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings Overview</h1>
        <p className="text-sm text-slate-500 mt-2">
          Manage your account, career context, communication, and preferences.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        {SETTINGS_NAVIGATION.map((group) => (
          <div key={group.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">{group.title}</h3>
            {/* If we have group descriptions in the future, we could put them here. */}
            <div className="space-y-4 mt-4">
              {group.links.map((link) => (
                <div key={link.label}>
                  {link.disabled ? (
                    <div className="text-sm text-slate-400 cursor-not-allowed inline-flex items-center gap-2">
                      {link.label}
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">Soon</span>
                    </div>
                  ) : (
                    <Link to={link.to} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                      {link.label} &rarr;
                    </Link>
                  )}
                  {link.description && (
                    <p className="text-xs text-slate-500 mt-1">{link.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
