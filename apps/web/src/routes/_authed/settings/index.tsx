import { createFileRoute, Link } from '@tanstack/react-router';
import { SETTINGS_NAVIGATION } from '../../../lib/settings-navigation';

export const Route = createFileRoute('/_authed/settings/')({
  component: SettingsLandingPage,
});

export function SettingsLandingPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <header className="border-b border-slate-200 pb-5">
        <h1
          className="text-[22px] font-bold tracking-tight text-slate-900"
          style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
        >
          Settings Overview
        </h1>
        <p
          className="text-[13.5px] text-slate-500 mt-1"
          style={{ fontFamily: 'sans-serif' }}
        >
          Manage your account, career context, communication, and preferences.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        {SETTINGS_NAVIGATION.map((group) => (
          <div
            key={group.title}
            className="rounded-none-none border border-slate-200 bg-slate-50 p-6 -xs"
          >
            <h2
              className="text-[14px] font-bold uppercase tracking-wider text-slate-900 mb-4 pb-2 border-b border-slate-100"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            >
              {group.title}
            </h2>
            <div className="space-y-4">
              {group.links.map((link) => (
                <div key={link.label}>
                  {link.disabled ? (
                    <div className="flex items-center justify-between text-[13.5px] text-slate-400 cursor-not-allowed">
                      <span style={{ fontFamily: 'sans-serif' }}>{link.label}</span>
                      <span className="text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded-none bg-slate-100 text-slate-400 font-mono">
                        Soon
                      </span>
                    </div>
                  ) : (
                    <Link
                      to={link.to}
                      className="group inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-900 hover:text-indigo-600 "
                      style={{ fontFamily: 'sans-serif' }}
                    >
                      <span>{link.label}</span>
                      <span className="-transform group-hover:translate-x-0.5">&rarr;</span>
                    </Link>
                  )}
                  {link.description && (
                    <p
                      className="text-[12px] text-slate-500 mt-0.5 leading-relaxed"
                      style={{ fontFamily: 'sans-serif' }}
                    >
                      {link.description}
                    </p>
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
