import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Mail, AlertCircle, ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/_guest/forgot-password')({
  component: ForgotPasswordComponent,
});

function ForgotPasswordComponent() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setLoading(true);

    // Backend does not support password reset yet.
    setLoading(false);
    setError('Password reset is not yet supported in this environment.');
  }

  return (
    <div className="w-full max-w-100 mx-auto">
      {/* Mobile logo */}
      <div className="flex items-center gap-2.5 mb-8 lg:hidden select-none">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--color-accent)] shadow-xs">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" />
          </svg>
        </div>
        <span className="font-bold text-[16px] font-heading tracking-tight text-[var(--color-primary)]">
          Outreacher
        </span>
      </div>

      <h1 className="text-[24px] font-bold mb-1 font-heading tracking-tight text-[var(--color-primary)]">
        Reset your password
      </h1>
      <p className="text-[14px] mb-7 text-[var(--color-muted-fg)] font-body">
        Enter your email and we'll send a reset link.
      </p>

      {error && (
        <div role="alert" className="flex items-start gap-2.5 px-4 py-3 rounded-lg mb-5 text-[13px] bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C]">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="font-body leading-relaxed">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="reset-email" className="block text-[13px] font-medium mb-1.5 font-heading text-[var(--color-primary)]">
            Email
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)] pointer-events-none">
              <Mail size={15} />
            </div>
            <input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg text-[14px] outline-none transition-all border bg-[var(--color-card)] text-[var(--color-primary)] font-body"
              style={{
                borderColor: error ? '#FCA5A5' : 'var(--color-border)',
                backgroundColor: error ? '#FEF2F2' : 'var(--color-card)',
              }}
              onFocus={(e) => {
                if (!error) e.currentTarget.style.borderColor = 'var(--color-accent)';
              }}
              onBlur={(e) => {
                if (!error) e.currentTarget.style.borderColor = 'var(--color-border)';
              }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-[14px] font-semibold transition-all flex items-center justify-center gap-2 font-heading bg-[var(--color-primary)] text-white shadow-xs disabled:opacity-50 disabled:cursor-not-allowed hover:bg-opacity-95 active:scale-[0.99]"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              <span>Sending…</span>
            </>
          ) : (
            'Send reset link'
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link
          to="/login"
          className="text-[13px] inline-flex items-center justify-center gap-1.5 text-[var(--color-muted-fg)] hover:text-[var(--color-primary)] transition-colors font-body font-medium"
        >
          <ArrowLeft size={14} /> Back to sign in
        </Link>
      </div>
    </div>
  );
}
