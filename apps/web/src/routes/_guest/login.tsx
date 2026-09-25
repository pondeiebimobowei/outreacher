import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useAuth } from '../../lib/auth-context';
import { normalizeApiBaseUrl } from '../../api/client';
import { Mail, Lock, Eye, EyeOff, AlertCircle, User } from 'lucide-react';
import { webEnv } from '../../config/env.config';

type LoginSearch = {
  mode?: 'login' | 'signup';
};

export const Route = createFileRoute('/_guest/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    return {
      mode: search.mode === 'signup' ? 'signup' : 'login',
    };
  },
  component: LoginComponent,
});

const GOOGLE_ERROR_COPY_MAP: Record<string, string> = {
  google_auth_failed:
    'Google sign-in could not be completed. Please try again or sign in with email and password.',
  account_conflict:
    'An account with this email already exists using password authentication. Please sign in with your password.',
  access_denied: 'Google sign-in permission was denied.',
};

function getAllowlistedErrorMessage(errorParam: string | null): string | null {
  if (!errorParam) return null;
  return GOOGLE_ERROR_COPY_MAP[errorParam] || 'An authentication error occurred. Please try again.';
}

type FieldError = { email?: string; password?: string; name?: string };

function LoginComponent() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  // Search parameters for signup mode routing
  const search = Route.useSearch() as { mode?: 'login' | 'signup' };
  
  const [mode, setMode] = useState<'login' | 'signup'>(search.mode === 'signup' ? 'signup' : 'login');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<FieldError>({});
  
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Extract URL search parameters for Google OAuth error callbacks
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const errParam = params.get('error');
      const mappedMsg = getAllowlistedErrorMessage(errParam);
      if (mappedMsg) {
        setFormError(mappedMsg);
      }
    }
  }, []);

  const apiBase = normalizeApiBaseUrl(webEnv.VITE_API_URL);
  const googleAuthUrl = `${apiBase}/auth/google`;

  function validate() {
    const e: FieldError = {};
    if (mode === 'signup' && !name.trim()) e.name = 'Name is required.';
    if (!email.trim()) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address.';
    if (!password) e.password = 'Password is required.';
    else if (password.length < 8) e.password = 'Password must be at least 8 characters.';
    return e;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    
    setErrors({});
    setFormError(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        await navigate({ to: '/dashboard' });
      } else {
        await signup(email, password, name || undefined);
        await navigate({ to: '/onboarding' });
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'An error occurred during authentication.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-100 mx-auto">
      {/* Mobile logo */}
      <div className="flex items-center gap-2.5 mb-8 lg:hidden select-none">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--color-accent)] shadow-xs">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" />
          </svg>
        </div>
        <span className="font-bold text-[16px] font-heading tracking-tight text-[var(--color-primary)]">Outreacher</span>
      </div>

      <h1 className="text-[24px] font-bold mb-1 font-heading tracking-tight text-[var(--color-primary)]">
        {mode === 'login' ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className="text-[14px] mb-7 text-[var(--color-muted-fg)] font-body">
        {mode === 'login' ? 'Sign in to your account to continue.' : 'Get started with your proactive career outreach workspace.'}
      </p>

      {formError && (
        <div role="alert" className="flex items-start gap-2.5 px-4 py-3 rounded-lg mb-5 text-[13px] bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C]">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="font-body leading-relaxed">{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {mode === 'signup' && (
          <div>
            <label htmlFor="name" className="block text-[13px] font-medium mb-1.5 font-heading text-[var(--color-primary)]">
              Full Name
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)] pointer-events-none">
                <User size={15} />
              </div>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((v) => ({ ...v, name: undefined }));
                }}
                placeholder="Alex Smith"
                className="w-full pl-9 pr-4 py-2.5 rounded-lg text-[14px] outline-none transition-all border bg-[var(--color-card)] text-[var(--color-primary)] font-body"
                style={{
                  borderColor: errors.name ? '#FCA5A5' : 'var(--color-border)',
                  backgroundColor: errors.name ? '#FEF2F2' : 'var(--color-card)',
                }}
                onFocus={(e) => {
                  if (!errors.name) e.currentTarget.style.borderColor = 'var(--color-accent)';
                }}
                onBlur={(e) => {
                  if (!errors.name) e.currentTarget.style.borderColor = 'var(--color-border)';
                }}
              />
            </div>
            {errors.name && (
              <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
                <AlertCircle size={12} /> {errors.name}
              </p>
            )}
          </div>
        )}

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-[13px] font-medium mb-1.5 font-heading text-[var(--color-primary)]">
            Email
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)] pointer-events-none">
              <Mail size={15} />
            </div>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((v) => ({ ...v, email: undefined }));
              }}
              placeholder="you@example.com"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg text-[14px] outline-none transition-all border bg-[var(--color-card)] text-[var(--color-primary)] font-body"
              style={{
                borderColor: errors.email ? '#FCA5A5' : 'var(--color-border)',
                backgroundColor: errors.email ? '#FEF2F2' : 'var(--color-card)',
              }}
              onFocus={(e) => {
                if (!errors.email) e.currentTarget.style.borderColor = 'var(--color-accent)';
              }}
              onBlur={(e) => {
                if (!errors.email) e.currentTarget.style.borderColor = 'var(--color-border)';
              }}
            />
          </div>
          {errors.email && (
            <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
              <AlertCircle size={12} /> {errors.email}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="text-[13px] font-medium font-heading text-[var(--color-primary)]">
              Password
            </label>
            {mode === 'login' && (
              <Link
                to="/forgot-password"
                className="text-[12.5px] font-medium transition-colors text-[var(--color-accent)] hover:underline font-body"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)] pointer-events-none">
              <Lock size={15} />
            </div>
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((v) => ({ ...v, password: undefined }));
              }}
              placeholder="Your password"
              className="w-full pl-9 pr-10 py-2.5 rounded-lg text-[14px] outline-none transition-all border bg-[var(--color-card)] text-[var(--color-primary)] font-body"
              style={{
                borderColor: errors.password ? '#FCA5A5' : 'var(--color-border)',
                backgroundColor: errors.password ? '#FEF2F2' : 'var(--color-card)',
              }}
              onFocus={(e) => {
                if (!errors.password) e.currentTarget.style.borderColor = 'var(--color-accent)';
              }}
              onBlur={(e) => {
                if (!errors.password) e.currentTarget.style.borderColor = 'var(--color-border)';
              }}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors text-[var(--color-muted-fg)] hover:text-[var(--color-primary)] p-0.5 rounded focus:outline-none"
            >
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444] font-body">
              <AlertCircle size={12} /> {errors.password}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 rounded-lg text-[14px] font-semibold transition-all mt-1 flex items-center justify-center gap-2 font-heading bg-[var(--color-primary)] text-white shadow-xs disabled:opacity-50 disabled:cursor-not-allowed hover:bg-opacity-95 active:scale-[0.99]"
        >
          {submitting ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              <span>{mode === 'login' ? 'Signing in...' : 'Creating account...'}</span>
            </>
          ) : (
            mode === 'login' ? 'Sign in' : 'Create Account'
          )}
        </button>
      </form>

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--color-border)]" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-[var(--color-card)] px-2.5 text-[var(--color-muted-fg)] font-body text-[11px] tracking-wider">Or continue with</span>
          </div>
        </div>

        <div className="mt-4">
          <a
            href={googleAuthUrl}
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-2.5 text-[14px] font-medium text-[var(--color-primary)] transition-all hover:bg-[var(--color-muted)] hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 active:scale-[0.99] shadow-xs font-heading"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Sign in with Google
          </a>
        </div>
      </div>

      <p className="text-center text-[13px] mt-6 text-[var(--color-muted-fg)] font-body">
        {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setFormError(null);
            setErrors({});
            // Update URL to match state without reloading
            navigate({ to: '/login', search: { mode: mode === 'login' ? 'signup' : undefined }, replace: true });
          }}
          className="font-semibold transition-colors font-heading text-[var(--color-accent)] hover:underline ml-0.5"
        >
          {mode === 'login' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  );
}
