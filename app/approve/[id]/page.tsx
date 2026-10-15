'use client';

import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { AbhedMark } from '@/components/mark';
import type { Approval } from '@/lib/types';
import { authHeader, saveToken } from '@/lib/approver-client';
import '../ax.css';

interface Payload {
  approval: Approval & { currentHash: string; assigneeNames?: string[] };
  tenant: string;
  company: string;
  me: { id: string; name: string; title: string; roles: string[]; can: { ok: boolean; why?: string } } | null;
  agent: { name: string; framework: string; model: string; risk: string; ownerName: string; purpose: string } | null;
  proposer: string | null;
  ownerName: string | null;
  now: number;
}

type Tab = 'why' | 'evidence' | 'reasoning' | 'fingerprint';
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;


export default function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string; title: string }[]>([]);
  const [who, setWho] = useState('');
  const [pin, setPin] = useState('');
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<Tab>('why');
  const [evViewed, setEvViewed] = useState(false);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const router = useRouter();
  const [fromApprover, setFromApprover] = useState(false);
  const openedAt = useRef<number | null>(null);
  const shownHash = useRef<string | null>(null);

  useEffect(() => {
    setFromApprover(new URLSearchParams(window.location.search).get('from') === 'approver');
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/approvals/${id}`, { cache: 'no-store', headers: authHeader() });
      const d = (await r.json()) as Payload & { error?: string };
      if (!r.ok) {
        setErr(d.error ?? 'Not found');
        return;
      }
      setData(d);
      if (openedAt.current === null) {
        openedAt.current = performance.now();
        shownHash.current = d.approval.actionHash; // the exact action this person is looking at
      }
    } catch {
      /* keep last */
    }
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 2500);
    const c = setInterval(() => setNow(Date.now()), 500);
    return () => {
      clearInterval(t);
      clearInterval(c);
    };
  }, [load]);

  const choose = (t: Tab) => {
    setTab(t);
    if (t === 'evidence') setEvViewed(true);
  };

  // people of this company who can sign in to decide
  useEffect(() => {
    if (!data || data.me || people.length) return;
    fetch('/api/approver/people')
      .then((r) => r.json())
      .then((all: { tenant: string; people: { id: string; name: string; title: string }[] }[]) => {
        const list = all.find((c) => c.tenant === data.tenant)?.people ?? [];
        setPeople(list);
        setWho((w) => w || list.find((p) => p.id === 'judge')?.id || list[0]?.id || '');
      })
      .catch(() => undefined);
  }, [data, people.length]);

  const signIn = async () => {
    if (!data) return;
    setSending(true);
    setErr(null);
    const r = await fetch('/api/approver/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant: data.tenant, humanId: who, pin }) });
    const d = (await r.json()) as { token?: string; error?: string };
    setSending(false);
    if (!r.ok || !d.token) return setErr((d.error ?? 'could not sign in').toLowerCase());
    saveToken(data.tenant, d.token);
    setPin('');
    void load();
  };

  const decide = async (decision: 'approve' | 'reject' | 'hold' | 'release' | 'escalate') => {
    if (!data) return;
    setSending(true);
    setErr(null);
    const decisionMs = Math.round(performance.now() - (openedAt.current ?? performance.now()));
    const r = await fetch(`/api/approvals/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeader() },
      body: JSON.stringify({
        decision,
        note,
        actionHash: shownHash.current,
        decisionMs,
        evidenceViewed: evViewed,
        device: /iPhone|Android/i.test(navigator.userAgent) ? 'phone' : 'browser',
      }),
    });
    const d = (await r.json()) as { error?: string; needSignIn?: boolean };
    setSending(false);
    if (d.needSignIn) saveToken(data.tenant, null);
    if (!r.ok) setErr((d.error ?? 'refused').toLowerCase());
    setNote('');
    void load();
  };

  const ap = data?.approval;
  const p = (ap?.req.params ?? {}) as Record<string, unknown>;
  const amount = typeof p.amount === 'number' ? p.amount : null;
  const secs = ap ? Math.max(0, Math.round((ap.expiresAt - now) / 1000)) : 0;
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const isRule = ap?.kind === 'rule_change';
  const actor = data?.agent?.name ?? data?.proposer ?? 'someone';
  const me = data?.me ?? null;
  const myVote = ap?.votes.find((v) => (me ? v.approverId === me.id || v.name === me.name : false));
  const pending = ap?.status === 'PENDING' && !myVote;
  const done = ap && !pending;

  // back to duty after a decision when this card was opened from the approver phone
  useEffect(() => {
    if (!done || !fromApprover) return;
    const t = setTimeout(() => router.push('/approver'), 4500);
    return () => clearTimeout(t);
  }, [done, fromApprover, router]);

  const company = data?.company.replace(' (fictional)', '') ?? '';
  const target = ap ? (ap.summary.split('→')[1] ?? '').replace(/refund ₹[\d,]+/i, '').trim() : '';
  const role = ap ? ap.approverRole.replace('approver_', '').replace(/_/g, ' ') : '';
  const executed = ap?.status === 'EXECUTED' || ap?.status === 'APPROVED';
  const tabs: [Tab, string][] = [
    ['why', 'Why you'],
    ['evidence', 'Evidence'],
    ['reasoning', 'Agent’s reasoning'],
    ['fingerprint', 'Fingerprint'],
  ];

  return (
    <main className="ax" aria-label="Approval">
      <div className="ax-shell" style={{ paddingBottom: pending && me?.can.ok ? 180 : 60 }}>
        <header className="ax-bar">
          {fromApprover ? (
            <button className="ax-back" onClick={() => router.push('/approver')}>
              ← Requests
            </button>
          ) : (
            <span className="ax-brand">
              <AbhedMark size={22} /> Abhed <small>Approvals</small>
            </span>
          )}
          <span className="ax-bar-r">
            {ap && pending && (
              <span className={`ax-pill ${secs < 120 ? 'warn' : 'on'}`}>
                <i />
                <span className="ax-timer">{clock}</span> left
              </span>
            )}
            {ap && done && (
              <span className={`ax-pill ${executed ? 'on' : ap.status === 'PENDING' ? 'warn' : 'bad'}`}>
                <i />
                {executed ? 'Approved' : ap.status === 'PENDING' ? 'Key 1 turned' : ap.status.charAt(0) + ap.status.slice(1).toLowerCase()}
              </span>
            )}
          </span>
        </header>

        {!ap && (
          <div className="ax-empty" style={{ marginTop: 24 }}>
            <b>{err ? 'This request isn’t here' : 'Opening the request…'}</b>
            {err ? 'It may have expired or been decided already.' : 'One moment.'}
          </div>
        )}

        {ap && pending && (
          <>
            <section className="ax-card" style={{ marginTop: 16 }}>
              <div className="ax-card-t">
                <span>{company}</span>
                <span>
                  needs {role}
                  {ap.twoKey > 1 ? ` × ${ap.twoKey}` : ''}
                </span>
              </div>
              <div className="ax-what">
                {isRule ? (
                  <>
                    <b>{actor}</b> proposes a rule change
                  </>
                ) : amount !== null ? (
                  <>
                    <b>{actor}</b> wants to refund
                  </>
                ) : (
                  <>
                    <b>{actor}</b> wants to
                  </>
                )}
              </div>
              <div className="ax-amount">{isRule ? 'New rule' : amount !== null ? inr(amount) : ap.req.action.replace(/_/g, ' ')}</div>
              {target && <div className="ax-what">{target}</div>}
              <div className="ax-meta">
                {(ap.ruleIds.length ? ap.ruleIds : ['no rule covers this']).map((r) => (
                  <span key={r} className="ax-tag">
                    {r}
                  </span>
                ))}
                {ap.assigneeNames?.length ? <span className="ax-tag">routed to {ap.assigneeNames.join(', ')}</span> : null}
                {ap.escalationLevel ? <span className="ax-tag">escalated</span> : null}
              </div>
              {ap.hold && (
                <p className="ax-p" style={{ marginTop: 14, color: 'var(--hold)' }}>
                  On hold by {ap.hold.by}
                  {ap.hold.note ? `: “${ap.hold.note}”` : ''}
                </p>
              )}
            </section>

            <nav className="ax-tabs" style={{ marginTop: 16 }} aria-label="Details">
              {tabs.map(([k, l]) => (
                <button key={k} className="ax-tab" aria-pressed={tab === k} onClick={() => choose(k)}>
                  {l}
                </button>
              ))}
            </nav>
            <section className="ax-card" key={tab}>
              {tab === 'why' && (
                <>
                  <p className="ax-p">{ap.why}</p>
                  {ap.history?.length ? (
                    <div style={{ marginTop: 14 }}>
                      {ap.history.slice(-3).map((h) => (
                        <div className="ax-kv" key={h.at}>
                          <span>{h.by}</span>
                          <span>{h.what}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
              {tab === 'evidence' &&
                ap.evidence.map((e) => (
                  <div className="ax-kv" key={e.label}>
                    <span>{e.label}</span>
                    <span>{e.value}</span>
                  </div>
                ))}
              {tab === 'reasoning' && (
                <>
                  <p className="ax-p dim">Untrusted. Shown after the facts, never instead of them.</p>
                  <p className="ax-p" style={{ marginTop: 10 }}>
                    “{ap.agentReasoning ?? (isRule ? 'A person proposed this, not an agent.' : 'No reasoning given.')}”
                  </p>
                </>
              )}
              {tab === 'fingerprint' && (
                <>
                  <p className="ax-p">Your approval is bound to this exact action. Change one rupee, the customer or the account, and it is void.</p>
                  <div className="ax-hash">{ap.actionHash}</div>
                </>
              )}
            </section>

            {!me ? (
              <section className="ax-card">
                <div className="ax-card-t">Sign in to decide</div>
                <label className="ax-field">
                  <span>Who are you</span>
                  <select className="ax-input" value={who} onChange={(e) => setWho(e.target.value)}>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ax-field">
                  <span>PIN</span>
                  <input className="ax-input ax-pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Your PIN" inputMode="numeric" type="password" />
                </label>
                <button className="ax-btn primary" disabled={sending || pin.length < 4 || !who} onClick={signIn}>
                  Sign in
                </button>
                <p className="ax-foot" style={{ textAlign: 'left' }}>
                  Your decision is signed with your identity as a {company} approver.
                </p>
              </section>
            ) : (
              <section className="ax-card">
                <div className="ax-set" style={{ paddingTop: 0 }}>
                  <span>
                    {me.name}
                    <small>{me.title}</small>
                  </span>
                  <button
                    className="ax-link"
                    onClick={() => {
                      saveToken(data!.tenant, null);
                      void load();
                    }}
                  >
                    Switch
                  </button>
                </div>
                {!me.can.ok && <p className="ax-err">{me.can.why}</p>}
                <input className="ax-input ax-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 160))} placeholder="Note (optional)" />
                <div className="ax-row" style={{ marginTop: 10 }}>
                  {ap.hold ? (
                    <button className="ax-btn ghost sm" disabled={sending} onClick={() => decide('release')}>
                      Release hold
                    </button>
                  ) : (
                    <button className="ax-btn ghost sm" disabled={sending || !me.can.ok} onClick={() => decide('hold')}>
                      Hold
                    </button>
                  )}
                  {ap.approverRole !== 'executive' && ap.kind !== 'rule_change' && (
                    <button className="ax-btn ghost sm" disabled={sending} onClick={() => decide('escalate')}>
                      Escalate
                    </button>
                  )}
                </div>
              </section>
            )}
            {err && <p className="ax-err">{err}</p>}

            {me?.can.ok && (
              <div className="ax-dock">
                <div className="ax-dock-in">
                  <div className="ax-row">
                    <button className="ax-btn danger" disabled={sending} onClick={() => decide('reject')}>
                      Reject
                    </button>
                    <button className="ax-btn primary" disabled={sending} onClick={() => decide('approve')} style={{ flex: 1.6 }}>
                      {sending ? 'Signing…' : 'Approve'}
                    </button>
                  </div>
                  <p className="ax-foot" style={{ marginTop: 0 }}>
                    Approves only this exact action, once, before the timer ends.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {ap && done && (
          <>
            <section className="ax-done">
              <div className={`ax-check ${executed ? '' : ap.status === 'PENDING' ? 'wait' : 'no'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={executed ? 'M5 12.5l4.5 4.5L19 7.5' : ap.status === 'PENDING' ? 'M12 7v5l3 2' : 'M7 7l10 10M17 7L7 17'} />
                </svg>
              </div>
              <h1 className="ax-h1" style={{ marginTop: 0 }}>
                {executed ? 'Approved.' : ap.status === 'PENDING' ? `Key ${ap.votes.length} of ${ap.twoKey} turned.` : `${ap.status.charAt(0) + ap.status.slice(1).toLowerCase()}.`}
                <br />
                <em>{executed ? 'Your name is on it.' : ap.status === 'PENDING' ? 'One more person must agree.' : 'Nothing moved.'}</em>
              </h1>
              <p className="ax-sub">{ap.summary}</p>
            </section>
            <section className="ax-card">
              <div className="ax-card-t">
                <span>On the ledger</span>
                <span>{ap.status === 'EXECUTED' && ap.executedSeq ? `record #${ap.executedSeq}` : ''}</span>
              </div>
              {ap.votes.map((v) => (
                <div className="ax-kv" key={v.name + v.at}>
                  <span>{v.name}</span>
                  <span>
                    {(v.decisionMs / 1000).toFixed(1)} s · evidence {v.evidenceViewed ? 'opened' : 'not opened'}
                  </span>
                </div>
              ))}
              {ap.votes.some((v) => !v.evidenceViewed && v.decisionMs < 4000) && <p className="ax-p" style={{ marginTop: 12, color: 'var(--hold)' }}>A fast approval without opening the evidence was flagged. Abhed governs people too.</p>}
            </section>
            {fromApprover && (
              <button className="ax-btn primary" style={{ marginTop: 16 }} onClick={() => router.push('/approver')}>
                Back to requests
              </button>
            )}
            {err && <p className="ax-err">{err}</p>}
          </>
        )}
      </div>
    </main>
  );
}
