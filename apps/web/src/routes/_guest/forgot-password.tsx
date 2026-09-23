/* eslint-disable */
// @ts-nocheck
import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Mail, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/_guest/forgot-password')({
  component: ForgotPasswordComponent,
});

function ForgotPasswordComponent() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

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
    
    // TODO: Backend does not yet support password reset; this is UI-only
    await new Promise((r) => setTimeout(r, 1000));
    
    setLoading(false);
    setSent(true);
  }

  return (
    <div className="w-full max-w-100 mx-auto">
      <div className="flex items-center gap-2 mb-8 lg:hidden">
        <div className="w-7 h-7 rounded-md flex items-center justify-center bg-[var(--color-accent)]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z" />
          </svg>
        </div>
        <span className="font-bold text-[15px] font-heading text-[var(--color-primary)]">
          Outreacher
        </span>
      </div>

      {sent ? (
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl mx-auto mb-5 flex items-center justify-center bg-[#ECFDF5] text-[#10B981]">
            <CheckCircle size={24} strokeWidth={1.8} />
          </div>
          <h1 className="text-[22px] font-bold mb-2 font-heading text-[var(--color-primary)]">
            Check your email
          </h1>
          <p className="text-[14px] mb-6 leading-[1.6] text-[var(--color-muted-fg)]">
            If that email is registered, you will receive a reset link sent to{' '}
            <strong className="text-[var(--color-primary)]">{email}</strong>. It expires in 15 minutes.
          </p>
          <p className="text-[13px] text-[var(--color-muted-fg)]">
            Didn't receive it?{' '}
            <button
              onClick={() => setSent(false)}
              className="font-semibold font-heading text-[var(--color-accent)] hover:underline"
            >
              Try again
            </button>
          </p>
          <div className="mt-6">
            <Link
              to="/login"
              className="text-[13px] flex items-center justify-center gap-1.5 text-[var(--color-muted-fg)] hover:text-[var(--color-primary)] transition-colors"
            >
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-[24px] font-bold mb-1 font-heading text-[var(--color-primary)]">
            Reset your password
          </h1>
          <p className="text-[14px] mb-7 text-[var(--color-muted-fg)]">
            Enter your email and we'll send a reset link.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div>
              <label className="block text-[13px] font-medium mb-1.5 font-heading text-[var(--color-primary)]">
                Email
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]">
                  <Mail size={15} />
                </div>
                <input
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
              {error && (
                <p className="mt-1.5 text-[12px] flex items-center gap-1 text-[#EF4444]">
                  <AlertCircle size={12} /> {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-[14px] font-semibold transition-all flex items-center justify-center gap-2 font-heading bg-[var(--color-primary)] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-opacity-90"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Sending…
                </>
              ) : (
                'Send reset link'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-[13px] flex items-center justify-center gap-1.5 text-[var(--color-muted-fg)] hover:text-[var(--color-primary)] transition-colors"
            >
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
