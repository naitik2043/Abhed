'use client';

import { useEffect, useState } from 'react';
import { AbhedMark } from '@/components/mark';
import GazeVideo from '../approve/gaze-video';
import '../approve/approve.css';

interface Status {
  id: string;
  lane: string;
  why: string;
  assignee: string;
  thought: string | null;
  steps: { seq: number; who: string; what: string; decision: string; approvers: string[] }[];
  waitingFor: { id: string; role: string } | null;
}

const EXAMPLES = [
  'UPI payment of ₹2,450 failed but money was debited. Please refund.',
  '₹48,000 was debited twice for my EMI. Please refund the duplicate ₹48,000.',
  'Please block my debit card, I lost my wallet.',
];

export default function SupportPage() {
  const [text, setText] = useState('');
  const [from, setFrom] = useState('');
  const [sending, setSending] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      setFrom(localStorage.getItem('kavach-customer') ?? '');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!ticket) return;
    let alive = true;
    const load = async () => {
      const r = await fetch(`/api/ticket/${encodeURIComponent(ticket.replace('#', ''))}`, { cache: 'no-store' }).catch(() => null);
      if (r?.ok && alive) setStatus((await r.json()) as Status);
    };
    void load();
    const t = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ticket]);

  const send = async () => {
    if (text.trim().length < 5) return setErr('tell us a little more.');
    setSending(true);
    setErr(null);
    try {
      localStorage.setItem('kavach-customer', from.trim());
    } catch {
      /* ignore */
    }
    const r = await fetch('/api/inbox', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), from: from.trim() || 'Guest customer', channel: 'WhatsApp' }),
    });
    const d = (await r.json()) as { result?: { id: string }; error?: string };
    setSending(false);
    if (!r.ok || !d.result) return setErr((d.error ?? 'could not send').toLowerCase());
    setTicket(d.result.id);
  };

  const tone = (d: string) => (d === 'ALLOWED' || d === 'EXECUTED' ? '✓' : d === 'NEEDS_APPROVAL' ? '⏳' : d === 'BLOCKED' || d === 'VOID' ? '✕' : '·');

  return (
    <footer className="ap" aria-label="NovaBank support">
      <GazeVideo />
      <div className="ap-jobs">
        <span className="ap-tag">{ticket ? `ticket ${ticket}` : 'novabank support · fictional'}</span>
        <span className="ap-headline ap-job-title">
          {!ticket ? (
            <>
              tell us what
              <br />
              went wrong
            </>
          ) : status?.lane === 'DONE' ? (
            <>
              sorted.
              <br />
              every step is on record.
            </>
          ) : status?.waitingFor ? (
            <>
              a person is
              <br />
              checking this
            </>
          ) : (
            <>
              {(status?.assignee ?? 'an agent').toLowerCase()} is
              <br />
              on it
            </>
          )}
        </span>
        {ticket && status && (
          <div className="ap-detail" style={{ marginTop: '1.3vw' }}>
            <div style={{ opacity: 0.6 }}>{status.why}</div>
            {status.thought && <div style={{ marginTop: '0.6em', opacity: 0.75 }}>{status.thought}</div>}
            {status.steps.map((s) => (
              <div className="ap-detail-row" key={s.seq}>
                <span>
                  {tone(s.decision)} {s.who}
                </span>
                <span>
                  {s.what}
                  {s.approvers.length ? ` · ${s.approvers.join(' + ')}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ap-logo" role="img" aria-label="Abhed">
        <span className="ap-wordmark">
          <AbhedMark size={34} /> Abhed
        </span>
      </div>

      <div className="ap-contact">
        <span className="ap-tag">{ticket ? 'live' : 'message us'}</span>
        {!ticket ? (
          <>
            <input className="ap-name" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="your name" maxLength={40} aria-label="Your name" />
            <textarea
              className="ap-name"
              style={{ height: 'auto', minHeight: 96, borderRadius: 18, padding: 12, resize: 'vertical', lineHeight: 1.4 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. ₹48,000 was debited twice for my EMI…"
              maxLength={1500}
              aria-label="Your message"
            />
            <div className="ap-contact-links">
              <button disabled={sending} onClick={send}>
                send →
              </button>
            </div>
            <div className="ap-nav ap-facts" style={{ marginTop: 12 }}>
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => setText(e)} style={{ opacity: 0.6, fontSize: '0.85em' }}>
                  “{e.slice(0, 46)}…”
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="ap-contact-links">
              <span className="ap-headline">{status?.lane === 'DONE' ? 'done ✓' : status?.waitingFor ? 'waiting for a person' : 'working…'}</span>
              <button
                onClick={() => {
                  setTicket(null);
                  setStatus(null);
                  setText('');
                }}
              >
                new message →
              </button>
            </div>
            <p className="ap-note">*an AI agent handles this, but big actions wait for a named person.</p>
          </>
        )}
        {err && <p className="ap-err">{err}</p>}
      </div>
    </footer>
  );
}
