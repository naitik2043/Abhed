'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccount } from '@/components/site';

const TOPICS = ['Pilot Abhed for my company', 'A question about the product', 'Something looks wrong', 'Partnership or press', 'Something else'];

export function ContactForm() {
  const [account] = useAccount();
  const [f, setF] = useState({ name: '', email: '', topic: TOPICS[0], message: '', website: '' });
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: number }>({});
  useEffect(() => {
    if (account) setF((v) => ({ ...v, name: v.name || account.name, email: v.email || account.email }));
  }, [account]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ busy: true });
    const r = await fetch('/api/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, topic: f.topic }) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { ok?: boolean; id?: number; error?: string }) : { error: 'You seem to be offline. Try again.' };
    if (r?.ok && j.ok) setState({ done: j.id ?? 0 });
    else setState({ error: j.error ?? 'Could not send. Try again.' });
  };

  if (state.done !== undefined)
    return (
      <div className="st-form st-sent" role="status">
        <span className="st-tick" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h2>Message received</h2>
        <p>Thank you, {f.name.split(' ')[0]}. We’ll reply to {f.email}.</p>
        <button className="st-btn" onClick={() => { setF({ ...f, message: '' }); setState({}); }}>
          Send another
        </button>
      </div>
    );

  return (
    <form className="st-form" onSubmit={send} noValidate>
      <div className="st-row2">
        <label className="st-field">
          <span>Your name</span>
          <input value={f.name} onChange={set('name')} autoComplete="name" required minLength={2} maxLength={80} placeholder="Priya Menon" />
        </label>
        <label className="st-field">
          <span>Work email</span>
          <input type="email" value={f.email} onChange={set('email')} autoComplete="email" required maxLength={160} placeholder="priya@company.com" />
        </label>
      </div>
      <label className="st-field">
        <span>What is it about?</span>
        <select value={f.topic} onChange={set('topic')}>
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="st-field">
        <span>Message</span>
        <textarea value={f.message} onChange={set('message')} required minLength={10} maxLength={4000} rows={6} placeholder="We run 40 support and refund agents and want approvals on anything above ₹10,000…" />
      </label>
      <label className="st-hp" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
      </label>
      {state.error && (
        <p className="st-error" role="alert">
          {state.error}
        </p>
      )}
      <button className="st-btn solid wide" disabled={state.busy}>
        {state.busy ? 'Sending…' : 'Send message'}
      </button>
      <p className="st-small">We store your name, email and message only to reply. See our <Link href="/privacy">privacy policy</Link>.</p>
    </form>
  );
}
