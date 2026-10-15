'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

// what a visitor was trying to open, in words, for the "sign in to continue" note
const FEATURE: Record<string, string> = {
  '/demo': 'the live demo', '/fleet': 'the fleet dashboard', '/connect': 'Connect', '/ledger': 'the ledger', '/arena': 'Break Abhed',
  '/readiness': 'the roadmap', '/business': 'pricing', '/command': 'the command center', '/incidents': 'incidents', '/insights': 'insights',
  '/integrate': 'Integrate', '/lab': 'the test lab', '/rules': 'the rulebook', '/security': 'security', '/twin': 'the twin demo', '/account': 'your account',
};

const ROLES = ['Operator', 'Approver', 'Developer', 'Compliance', 'Founder or executive', 'Student or researcher'];

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}
const LABEL = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

function Password({ value, onChange, autoComplete, meter }: { value: string; onChange: (v: string) => void; autoComplete: string; meter?: boolean }) {
  const [show, setShow] = useState(false);
  const s = strength(value);
  return (
    <>
      <span className="au-pw">
        <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required minLength={8} maxLength={200} placeholder={meter ? 'At least 8 characters' : 'Your password'} />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? 'Hide' : 'Show'}
        </button>
      </span>
      {meter && value && (
        <span className={`au-meter s${value.length < 8 ? 0 : s}`} aria-live="polite">
          <i />
          <i />
          <i />
          <i />
          <em>{LABEL[value.length < 8 ? 0 : s]}</em>
        </span>
      )}
    </>
  );
}

/** One form for both sign in and sign up; the server sets the session cookie. */
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const dest = next && next.startsWith('/') && !next.startsWith('//') && !/^\/(login|signup)/.test(next) ? next : '/fleet';
  const wanted = next ? FEATURE[next.split(/[?#]/)[0].split('/').slice(0, 2).join('/')] : undefined;
  const [f, setF] = useState({ name: '', email: '', company: '', role: ROLES[0], password: '', agree: false });
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});
  const signup = mode === 'signup';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signup && !f.agree) return setState({ error: 'Please accept the terms and privacy policy.' });
    setState({ busy: true });
    const r = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(signup ? f : { email: f.email, password: f.password }),
    }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { error?: string }) : { error: 'You seem to be offline. Try again.' };
    if (r?.ok) {
      router.replace(dest);
      router.refresh();
    } else setState({ error: j.error ?? 'Something went wrong. Try again.' });
  };

  return (
    <form className="au-form" onSubmit={submit} noValidate>
      {wanted && (
        <p className="au-need" role="status">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
          </svg>
          {signup ? `Create an account to open ${wanted}.` : `Sign in to open ${wanted}.`} You’ll go straight there.
        </p>
      )}
      <p className="au-k">{signup ? 'Create your account' : 'Welcome back'}</p>
      <h1>{signup ? 'Put your agents on the record.' : 'Sign in to Abhed.'}</h1>
      <p className="au-sub">
        {signup ? (
          <>
            Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link>
          </>
        )}
      </p>
      {signup && (
        <label className="st-field">
          <span>Full name</span>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" required minLength={2} maxLength={80} placeholder="Priya Menon" />
        </label>
      )}
      <label className="st-field">
        <span>{signup ? 'Work email' : 'Email'}</span>
        <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" required maxLength={160} placeholder="you@company.com" />
      </label>
      {signup && (
        <div className="st-row2">
          <label className="st-field">
            <span>
              Company <em>optional</em>
            </span>
            <input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} autoComplete="organization" maxLength={80} placeholder="NovaBank" />
          </label>
          <label className="st-field">
            <span>Your role</span>
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="st-field">
        <span>Password</span>
        <Password value={f.password} onChange={(password) => setF({ ...f, password })} autoComplete={signup ? 'new-password' : 'current-password'} meter={signup} />
      </label>
      {signup ? (
        <label className="au-check">
          <input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} />
          <span>
            I agree to the <Link href="/terms">terms</Link> and the <Link href="/privacy">privacy policy</Link>.
          </span>
        </label>
      ) : (
        <p className="au-forgot">
          Forgot your password? <Link href="/contact">Write to us</Link> from the same email.
        </p>
      )}
      {state.error && (
        <p className="st-error" role="alert">
          {state.error}
        </p>
      )}
      <button className="st-btn solid wide" disabled={state.busy}>
        {state.busy ? (signup ? 'Creating your account…' : 'Signing in…') : signup ? 'Create account' : 'Sign in'}
      </button>
      <p className="au-legal">Passwords are stored only as a bcrypt hash. Sign-in locks for 15 minutes after 8 wrong attempts.</p>
    </form>
  );
}
