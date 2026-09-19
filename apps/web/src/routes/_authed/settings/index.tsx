import { createFileRoute, Link } from '@tanstack/react-router';

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
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Account</h3>
          <p className="text-xs text-slate-500 mb-4 h-8">Your profile and account information</p>
          <div className="space-y-2">
            <div className="text-sm text-slate-400 cursor-not-allowed inline-flex items-center gap-2">
              Profile
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">Soon</span>
            </div>
            <br />
            <Link to="/settings/career-profile" className="text-sm font-medium text-blue-600 hover:text-blue-800">
              Career profile &rarr;
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Email & sending</h3>
          <p className="text-xs text-slate-500 mb-4 h-8">Manage the accounts Outreacher can send from.</p>
          <div className="space-y-2">
            <div className="text-sm text-slate-400 cursor-not-allowed inline-flex items-center gap-2">
              Sender accounts
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">Soon</span>
            </div>
            <br />
            <Link to="/settings/integrations" className="text-sm font-medium text-blue-600 hover:text-blue-800">
              Integrations &rarr;
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Preferences</h3>
          <p className="text-xs text-slate-500 mb-4 h-8">Appearance, timezone, and workflow settings.</p>
          <div className="space-y-2">
            <div className="text-sm text-slate-400 cursor-not-allowed inline-flex items-center gap-2">
              Appearance
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">Soon</span>
            </div>
            <br />
            <div className="text-sm text-slate-400 cursor-not-allowed inline-flex items-center gap-2">
              Timezone
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">Soon</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Security</h3>
          <p className="text-xs text-slate-500 mb-4 h-8">Password, 2FA, and active sessions.</p>
          <div className="space-y-2">
            <div className="text-sm text-slate-400 cursor-not-allowed inline-flex items-center gap-2">
              Password
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">Soon</span>
            </div>
            <br />
            <div className="text-sm text-slate-400 cursor-not-allowed inline-flex items-center gap-2">
              Sessions
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">Soon</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
