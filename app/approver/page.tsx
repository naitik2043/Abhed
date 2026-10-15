'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AbhedMark } from '@/components/mark';
import { authHeader, readTokens, saveToken } from '@/lib/approver-client';
import '../approve/ax.css';

interface Pending {
  id: string;
  tenant: string;
  company?: string;
  hold: { by: string; note?: string } | null;
  assignees: string[];
  assignedToMe: boolean;
  canDecide: boolean | null;
  cannotWhy?: string;
  escalationLevel: number;
  kind: string;
  summary: string;
  why: string;
  amount: number | null;
  actor: string;
  createdAt: number;
  expiresAt: number;
  approverRole: string;
  twoKey: number;
  votes: string[];
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function b64ToUint8(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.18].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.15);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.16);
    });
  } catch {
    /* no audio */
  }
}

type View = 'queue' | 'hold' | 'above' | 'history' | 'profile';
interface Profile {
  tenant: string;
  company: string;
  person: { id: string; name: string; title: string; roles: string[] };
  stats: { decisions: number; approved: number; rejected: number; held: number; escalated: number; medianSeconds: number | null; rubberStamps: number; ownsAgents: string[]; recent: { id: string; summary: string; status: string; at: number; seconds: number; device: string }[] };
}
const short = (c?: string) => (c ?? '').replace(' (fictional)', '').toLowerCase();

export default function ApproverPage() {
  const router = useRouter();
  const [onDuty, setOnDuty] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [recent, setRecent] = useState<{ id: string; company: string; status: string; summary: string; by: string }[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [companies, setCompanies] = useState<{ tenant: string; company: string; people: { id: string; name: string; title: string }[] }[]>([]);
  const [tenant, setTenant] = useState('banking');
  const [who, setWho] = useState('judge');
  const [pin, setPin] = useState('');
  const [view, setView] = useState<View>('queue');
  const [push, setPush] = useState<'unsupported' | 'off' | 'on' | 'denied' | 'ios-install'>('off');
  const [autoOpen, setAutoOpen] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seen = useRef<Set<string> | null>(null);
  const sub = useRef<PushSubscriptionJSON | null>(null);
  const names = profiles.map((p) => p.person.name);
  const label = [...new Set(names)].join(' / ');

  const loadProfiles = useCallback(async () => {
    const r = await fetch('/api/approver/me', { headers: authHeader(), cache: 'no-store' }).catch(() => null);
    if (!r?.ok) return [];
    const d = (await r.json()) as { profiles: Profile[] };
    setProfiles(d.profiles);
    return d.profiles;
  }, []);

  useEffect(() => {
    void loadProfiles().then((ps) => {
      try {
        if (ps.length && localStorage.getItem('kavach-on-duty') === '1') setOnDuty(true);
        if (localStorage.getItem('kavach-auto-open') === '0') setAutoOpen(false);
      } catch {
        /* private mode */
      }
    });
    fetch('/api/approver/people')
      .then((r) => r.json())
      .then(setCompanies)
      .catch(() => undefined);
    const ios = /iPhone|iPad/i.test(navigator.userAgent);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) setPush(ios && !standalone ? 'ios-install' : 'unsupported');
    else if (Notification.permission === 'denied') setPush('denied');
    else if (Notification.permission === 'granted') setPush('on');
  }, [loadProfiles]);

  const presence = useCallback(async () => {
    if (!label) return;
    await fetch('/api/approver/presence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: label, device: /iPhone|Android/i.test(navigator.userAgent) ? (/iPhone/i.test(navigator.userAgent) ? 'iPhone' : 'Android') : 'browser', subscription: sub.current }),
    }).catch(() => undefined);
  }, [label]);

  const enablePush = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setPush(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const { publicKey } = (await (await fetch('/api/push')).json()) as { publicKey: string | null };
      if (!publicKey) {
        setNote('push keys are not configured on the server; this page still buzzes while open.');
        setPush('on');
        return;
      }
      const existing = await reg.pushManager.getSubscription();
      const s = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(publicKey) }));
      sub.current = s.toJSON();
      setPush('on');
      await presence();
    } catch (e) {
      setNote(`notifications unavailable here (${e instanceof Error ? e.message : 'error'}). keep this page open; it will buzz.`);
    }
  }, [presence]);

  useEffect(() => {
    if (!onDuty || push !== 'on' || sub.current) return;
    navigator.serviceWorker
      ?.register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((s) => {
        if (s) {
          sub.current = s.toJSON();
          void presence();
        }
      })
      .catch(() => undefined);
  }, [onDuty, push, presence]);

  useEffect(() => {
    if (!onDuty) return;
    void presence();
    const t = setInterval(presence, 10_000);
    return () => clearInterval(t);
  }, [onDuty, presence]);

  useEffect(() => {
    if (!onDuty) return;
    let alive = true;
    const load = async () => {
      try {
        const d = (await (await fetch('/api/approver/inbox', { cache: 'no-store', headers: authHeader() })).json()) as { pending: Pending[]; recent: typeof recent };
        if (!alive) return;
        const open = d.pending.filter((p) => !p.votes.some((v) => names.includes(v)));
        setPending(open);
        setRecent(d.recent);
        const mine = open.filter((p) => p.canDecide && !p.hold);
        if (seen.current === null) {
          seen.current = new Set(open.map((p) => p.id)); // don't jump on what was already waiting
          return;
        }
        const fresh = mine.filter((p) => !seen.current!.has(p.id));
        open.forEach((p) => seen.current!.add(p.id));
        if (fresh.length) {
          navigator.vibrate?.([220, 90, 220, 90, 320]);
          beep();
          if (autoOpen && document.visibilityState === 'visible') router.push(`/approve/${fresh[0].id}?from=approver`);
        }
      } catch {
        /* keep last */
      }
    };
    void load();
    const t = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDuty, label, autoOpen, router]);

  const signIn = async () => {
    setBusy(true);
    setNote(null);
    const r = await fetch('/api/approver/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenant, humanId: who, pin }) });
    const d = (await r.json()) as { token?: string; error?: string };
    setBusy(false);
    if (!r.ok || !d.token) return setNote((d.error ?? 'could not sign in').toLowerCase());
    saveToken(tenant, d.token);
    setPin('');
    await loadProfiles();
    try {
      localStorage.setItem('kavach-on-duty', '1');
    } catch {
      /* ignore */
    }
    setOnDuty(true);
    beep(); // unlocks audio on iOS after a tap
    if (push === 'off') await enablePush();
  };

  const signOutAll = () => {
    for (const t of Object.keys(readTokens())) saveToken(t, null);
    try {
      localStorage.setItem('kavach-on-duty', '0');
    } catch {
      /* ignore */
    }
    setProfiles([]);
    setOnDuty(false);
    seen.current = null;
  };

  const queue = pending.filter((p) => p.canDecide && !p.hold);
  const held = pending.filter((p) => p.hold);
  const above = pending.filter((p) => p.canDecide === false);
  const people = companies.find((c) => c.tenant === tenant)?.people ?? [];
  const decidedToday = profiles.reduce((n, p) => n + p.stats.decisions, 0);
  const first = profiles[0]?.person.name.split(' ')[0];
  const hour = new Date(now).getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const what = (p: Pending) => {
    if (p.kind === 'rule_change') return 'Rule change';
    const t = (p.summary.split('→')[1] ?? p.summary).trim();
    return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 44);
  };
  const left = (p: Pending) => Math.max(0, Math.round((p.expiresAt - now) / 1000));
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const card = (p: Pending, i: number) => (
    <button key={p.id} className={`ax-req ${p.assignedToMe ? 'mine' : ''}`} style={{ animationDelay: `${i * 0.05}s` }} onClick={() => router.push(`/approve/${p.id}?from=approver`)}>
      <span className="ax-av">{p.actor[0]?.toUpperCase()}</span>
      <span>
        <span className="ax-req-t" style={{ display: 'block' }}>
          {what(p)}
        </span>
        <span className="ax-req-m" style={{ display: 'block' }}>
          {p.actor} · {(p.company ?? '').replace(' (fictional)', '')}
          {p.hold ? ` · held by ${p.hold.by}` : p.assignedToMe ? ' · routed to you' : ''}
          {p.escalationLevel ? ` · escalated` : ''}
        </span>
      </span>
      <span className={`ax-req-r ${left(p) < 120 ? 'late' : ''}`}>
        <b>{mmss(left(p))}</b>
        left
      </span>
    </button>
  );
  const views: [View, string, number | null][] = [
    ['queue', 'For you', queue.length],
    ['hold', 'On hold', held.length],
    ['above', 'Above you', above.length],
    ['history', 'Decided', null],
    ['profile', 'Profile', null],
  ];
  const empty = (title: string, body: string) => (
    <div className="ax-empty">
      <div className="ax-ic">
        <Ic k="check" />
      </div>
      <b>{title}</b>
      {body}
    </div>
  );

  return (
    <main className="ax" aria-label="Abhed approvals">
      <div className="ax-shell">
        <header className="ax-bar">
          <span className="ax-brand">
            <AbhedMark size={22} /> Abhed <small>Approvals</small>
          </span>
          <span className="ax-bar-r">
            <span className={`ax-pill ${onDuty ? 'on' : ''}`}>
              <i />
              {onDuty ? 'On duty' : 'Signed out'}
            </span>
          </span>
        </header>

        {!onDuty ? (
          <>
            <section className="ax-hero">
              <div className="ax-kicker">Approver phone</div>
              <h1 className="ax-h1">
                Be the human <em>in the loop.</em>
              </h1>
              <p className="ax-sub">When an AI agent wants to do something big, it waits for you. Sign in once; requests arrive here and open by themselves.</p>
            </section>
            {signInCard()}
            <div className="ax-trust">
              <div>
                <span className="ax-ic">
                  <Ic k="id" />
                </span>
                <span>
                  <b>Signed with your identity</b>Every decision carries your name, role and time on the ledger.
                </span>
              </div>
              <div>
                <span className="ax-ic">
                  <Ic k="print" />
                </span>
                <span>
                  <b>Exact action only</b>You approve one fingerprinted action. Change one rupee and it is void.
                </span>
              </div>
              <div>
                <span className="ax-ic">
                  <Ic k="clock" />
                </span>
                <span>
                  <b>Nothing waits forever</b>Unanswered requests escalate, then expire. Nothing runs by default.
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <section className="ax-hero" style={{ paddingBottom: 18 }}>
              <div className="ax-kicker">{profiles.map((p) => p.company.replace(' (fictional)', '')).join(' · ')}</div>
              <h1 className="ax-h1">
                {greet}, {first}.
                <br />
                <em>{queue.length ? `${queue.length} ${queue.length === 1 ? 'agent needs' : 'agents need'} you.` : 'Nothing needs you.'}</em>
              </h1>
            </section>
            <div className="ax-stats">
              <div className={`ax-stat ${queue.length ? 'hot' : ''}`}>
                <b>{queue.length}</b>
                <span>for you</span>
              </div>
              <div className="ax-stat">
                <b>{held.length}</b>
                <span>on hold</span>
              </div>
              <div className="ax-stat">
                <b>{decidedToday}</b>
                <span>decided</span>
              </div>
            </div>
            <nav className="ax-tabs" aria-label="Views">
              {views.map(([k, l, n]) => (
                <button key={k} className="ax-tab" aria-pressed={view === k} onClick={() => setView(k)}>
                  {l}
                  {n !== null && <em>{n}</em>}
                </button>
              ))}
            </nav>

            {view === 'queue' && <div className="ax-list">{queue.length ? queue.map(card) : empty('All clear', 'Agents are working inside their limits. Keep this open; new requests open by themselves.')}</div>}
            {view === 'hold' && <div className="ax-list">{held.length ? held.map(card) : empty('Nothing on hold', 'Requests you or a colleague park appear here.')}</div>}
            {view === 'above' && <div className="ax-list">{above.length ? above.map(card) : empty('Nothing above your level', 'Requests that need a higher authority show here, read-only.')}</div>}
            {view === 'history' && (
              <div className="ax-card">
                <div className="ax-card-t">Recently decided</div>
                {recent.length ? (
                  recent.map((r) => (
                    <div className="ax-hist" key={r.id}>
                      <span>
                        {r.summary ? r.summary.slice(0, 38) : r.id}
                        <br />
                        <small>{r.company.replace(' (fictional)', '')}</small>
                      </span>
                      <span style={{ textAlign: 'right' }}>
                        <b style={{ color: r.status === 'EXECUTED' || r.status === 'APPROVED' ? 'var(--ok)' : r.status === 'REJECTED' ? 'var(--no)' : 'var(--mut)', fontWeight: 500 }}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</b>
                        <br />
                        <small>{r.by}</small>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="ax-p dim">No decisions yet.</p>
                )}
              </div>
            )}
            {view === 'profile' && (
              <>
                {profiles.map((p) => (
                  <div className="ax-card" key={p.tenant}>
                    <div className="ax-card-t">
                      <span>{p.company.replace(' (fictional)', '')}</span>
                      <span>{p.person.roles.join(' · ').replace(/_/g, ' ')}</span>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 500 }}>{p.person.name}</div>
                    <div className="ax-p dim">{p.person.title}</div>
                    <div className="ax-stats" style={{ marginTop: 16, marginBottom: 0 }}>
                      <div className="ax-stat">
                        <b>{p.stats.approved}</b>
                        <span>approved</span>
                      </div>
                      <div className="ax-stat">
                        <b>{p.stats.rejected}</b>
                        <span>rejected</span>
                      </div>
                      <div className="ax-stat">
                        <b>{p.stats.medianSeconds ?? '—'}</b>
                        <span>median sec</span>
                      </div>
                    </div>
                    {p.stats.rubberStamps > 0 && <p className="ax-err">{p.stats.rubberStamps} fast approvals without evidence were flagged.</p>}
                    {p.stats.ownsAgents.length > 0 && <p className="ax-p dim" style={{ marginTop: 12 }}>Owns {p.stats.ownsAgents.join(', ')}, so cannot approve their riskiest actions.</p>}
                  </div>
                ))}
                <div className="ax-card">
                  <div className="ax-card-t">Add another company</div>
                  {signInCard(true)}
                </div>
              </>
            )}

            <div className="ax-card" style={{ marginTop: 18 }}>
              <div className="ax-card-t">This phone</div>
              <div className="ax-set">
                <span>
                  Buzz on new requests
                  <small>{push === 'on' ? 'Notifications on' : push === 'ios-install' ? 'iPhone: Share → Add to Home Screen first' : push === 'denied' ? 'Blocked in browser settings; buzzes while open' : 'Buzzes while this page is open'}</small>
                </span>
                {push === 'off' ? (
                  <button className="ax-switch" role="switch" aria-checked="false" aria-label="Turn on notifications" onClick={enablePush} />
                ) : (
                  <span className={`ax-pill ${push === 'on' ? 'on' : ''}`}>
                    <i />
                    {push === 'on' ? 'On' : 'Open only'}
                  </span>
                )}
              </div>
              <div className="ax-set">
                <span>
                  Open new requests automatically
                  <small>Jumps straight to the decision screen</small>
                </span>
                <button
                  className="ax-switch"
                  role="switch"
                  aria-checked={autoOpen}
                  aria-label="Auto-open"
                  onClick={() => {
                    setAutoOpen(!autoOpen);
                    try {
                      localStorage.setItem('kavach-auto-open', autoOpen ? '0' : '1');
                    } catch {
                      /* ignore */
                    }
                  }}
                />
              </div>
              <div className="ax-set">
                <span>
                  Signed in as {label}
                  <small>{profiles.length} {profiles.length === 1 ? 'company' : 'companies'}</small>
                </span>
                <button className="ax-link" onClick={signOutAll}>
                  Sign out
                </button>
              </div>
            </div>
          </>
        )}
        {note && <p className="ax-err">{note}</p>}
        <p className="ax-foot">Companies are fictional. Every decision is written to Abhed’s hash-chained ledger.</p>
      </div>
    </main>
  );

  function signInCard(bare?: boolean) {
    const body = (
      <>
        <label className="ax-field">
          <span>Company</span>
          <select
            className="ax-input"
            value={tenant}
            onChange={(e) => {
              setTenant(e.target.value);
              setWho(companies.find((c) => c.tenant === e.target.value)?.people.find((p) => p.id === 'judge')?.id ?? '');
            }}
          >
            {companies.map((c) => (
              <option key={c.tenant} value={c.tenant}>
                {c.company.replace(' (fictional)', '')}
              </option>
            ))}
          </select>
        </label>
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
          <input className="ax-input ax-pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="From your company admin" inputMode="numeric" type="password" autoComplete="one-time-code" />
        </label>
        <button className="ax-btn primary" disabled={busy || pin.length < 4 || !who} onClick={signIn}>
          {busy ? 'Signing in…' : onDuty ? 'Add this company' : 'Go on duty'}
        </button>
      </>
    );
    return bare ? body : <div className="ax-card">{body}</div>;
  }
}

function Ic({ k }: { k: 'id' | 'print' | 'clock' | 'check' }) {
  const d = {
    id: 'M4 6h16v12H4zM8 10h.01M12 10h4M8 14h8',
    print: 'M12 3a8 8 0 0 0-8 8v2M20 11a8 8 0 0 0-5-7.4M8 20.5A12 12 0 0 1 7 11a5 5 0 0 1 10 0c0 2 0 4-.6 6M12 11v3a14 14 0 0 1-1.5 7',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    check: 'M5 12.5l4.5 4.5L19 7.5',
  }[k];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
