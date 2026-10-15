'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Agent = { id: string; name: string; job: string; status: string; online: boolean; lastSeen: number | null };
type Note = { at: number; text: string; tone: 'info' | 'ok' | 'warn' };
type Act = { seq: number; ts: number; actor: string; action: string; decision: string; reason: string; rule?: string; ms?: number };
type Company = {
  tenant: string;
  company: string;
  industry: string;
  since: number | null;
  site: { url: string; name: string; at: number } | null;
  timeline: Note[];
  agents: Agent[];
  activity: Act[];
  pending: { id: string; summary: string }[];
  rules: { id: string; says: string }[];
};
type State = { pending: { code: string; exp: number } | null; log: Note[]; companies: Company[] };
type GwAgent = { id: string; name: string; calls: number; toolCalls: number; blocked: number; held: number; online: boolean; lastSeen: number };
type GwEvent = { id: number; at: number; agent: string; kind: string; text: string; tool?: string; args?: string; decision?: string; rule?: string; ms?: number };
type GwHold = { id: string; agent: string; tool: string; args: string; reason: string; rule: string; at: number };
type GwCompany = { id: string; name: string; site?: string; keyHint: string; createdAt: number; firstCallAt?: number; linkedAt?: number; rules: { holdAbove: number; blockAbove: number; allowedDomains: string[]; blockTools: string[] }; agents: GwAgent[]; events: GwEvent[]; holds: GwHold[] };

const DECISION: Record<string, [string, string]> = {
  ALLOWED: ['allow', 'Allowed'],
  EXECUTED: ['allow', 'Executed'],
  NEEDS_APPROVAL: ['human', 'To a person'],
  BLOCKED: ['block', 'Stopped'],
  PAUSED: ['block', 'Paused'],
  INFO: ['muted', 'Logged'],
};
const clock = (ts: number) => new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const host = (u?: string) => (u ?? '').replace(/^https?:\/\//, '');

export default function ConnectPage() {
  const [s, setS] = useState<State | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const known = useRef<Set<string> | null>(null);
  const [mode, setMode] = useState<'nocode' | 'sdk'>('nocode');
  const [gw, setGw] = useState<GwCompany[]>([]);
  const [created, setCreated] = useState<{ id: string; key: string } | null>(null);
  const [origin, setOrigin] = useState('');
  const [form, setForm] = useState({ name: '', site: '' });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    setOrigin(window.location.origin);
    let alive = true;
    const tick = async () => {
      try {
        const j = (await (await fetch('/api/connect', { cache: 'no-store' })).json()) as State;
        if (!alive) return;
        const ids = new Set(j.companies.map((c) => c.tenant));
        if (known.current) {
          const fresh = [...ids].find((id) => !known.current!.has(id));
          if (fresh) {
            setJoined(fresh);
            setOpen(fresh);
          }
        }
        known.current = ids;
        setS(j);
        const g = (await (await fetch('/api/gateway', { cache: 'no-store' })).json()) as { companies: GwCompany[] };
        if (alive) setGw(g.companies);
      } catch {
        /* keep the last frame */
      }
      if (alive) setTimeout(tick, 1500);
    };
    void tick();
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const r = await fetch('/api/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) window.alert(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Failed');
    return r.ok;
  }
  const withPin = async (label: string, body: Record<string, unknown>) => {
    const pin = window.prompt(`${label}\nPIN:`);
    if (pin) return post({ ...body, pin });
    return false;
  };

  async function gpost(body: Record<string, unknown>) {
    setBusy(true);
    const r = await fetch('/api/gateway', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) window.alert(String(j.error ?? 'Failed'));
    return r.ok ? j : null;
  }
  const baseUrl = `${origin}/api/gw/v1`;
  const mine = created ? gw.find((c) => c.id === created.id) : null;

  const left = s?.pending ? Math.max(0, Math.round((s.pending.exp - now) / 1000)) : 0;
  const j = joined ? s?.companies.find((c) => c.tenant === joined) : null;

  return (
    <main className="page cn">
      <header className="page-head">
        <div>
          <div className="kicker">Connect</div>
          <h1 className="page-title">
            Add a company. <em>Watch it come alive.</em>
          </h1>
          <p className="page-sub">Abhed knows nothing about a company until its website pairs.</p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={async () => {
            if (await withPin('Reset the demo: only NovaBank stays in Abhed.', { action: 'reset' })) {
              setJoined(null);
              setOpen(null);
              known.current = null;
            }
          }}
        >
          Reset demo
        </button>
      </header>

      <div className="cn-grid">
        <section className="panel cn-add">
          <div className="seg cn-mode" role="tablist">
            <button className={mode === 'nocode' ? 'on' : ''} onClick={() => setMode('nocode')}>
              No code
            </button>
            <button className={mode === 'sdk' ? 'on' : ''} onClick={() => setMode('sdk')}>
              Abhed SDK
            </button>
          </div>
          {mode === 'nocode' ? (
            created ? (
              <div className="cn-joined">
                <div className="cn-label">{mine?.firstCallAt ? 'Connected' : mine?.linkedAt ? 'Key verified · now send any agent a message' : 'Paste these into the company’s AI settings'}</div>
                <div className="cn-name">{mine?.name ?? form.name}</div>
                <div className="cn-cred">
                  <span>Base URL</span>
                  <code>{baseUrl}</code>
                  <button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(baseUrl)}>
                    Copy
                  </button>
                </div>
                <div className="cn-cred">
                  <span>API key</span>
                  <code>{created.key}</code>
                  <button className="btn btn-ghost btn-sm" onClick={() => void navigator.clipboard?.writeText(created.key)}>
                    Copy
                  </button>
                </div>
                <ul className="cn-check">
                  <li className={mine?.linkedAt || mine?.firstCallAt ? 'done' : 'wait'}>{mine?.linkedAt || mine?.firstCallAt ? 'Key verified by the company’s system' : 'Waiting for the company to save the key…'}</li>
                  <li className={mine?.firstCallAt ? 'done' : 'wait'}>{mine?.firstCallAt ? 'First agent message received' : 'Waiting for the first agent message…'}</li>
                  <li className="done">Abhed rulebook on: bulk data, destructive actions, data leaving, money limits</li>
                  {(mine?.agents ?? []).map((a) => (
                    <li key={a.id} className="done">
                      Agent discovered: {a.name}
                    </li>
                  ))}
                </ul>
                <p className="cn-copy" style={{ marginBottom: 0 }}>No code change, no redeploy. Agents appear here as they make their first call.</p>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => setCreated(null)}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="cn-label">Connect any company · no code</div>
                <p className="cn-copy">Abhed gives the company an address and a key. They paste both into their agents’ AI settings, where an OpenAI-compatible endpoint goes. Every agent is governed from its next message.</p>
                <input className="input cn-in" placeholder="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input className="input cn-in" placeholder="Website (optional)" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
                <button
                  className="btn btn-solid cn-go"
                  disabled={busy || form.name.trim().length < 2}
                  onClick={async () => {
                    const j = await gpost({ action: 'add', name: form.name, site: form.site });
                    if (j) {
                      setCreated({ id: String(j.id), key: String(j.key) });
                      setOpen(`gw:${String(j.id)}`);
                    }
                  }}
                >
                  Connect company
                </button>
              </>
            )
          ) : (
            <>
          {j ? (
            <div className="cn-joined">
              <span className="cn-tick">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <div className="cn-label ok">Joined just now</div>
              <div className="cn-name">{j.company}</div>
              <div className="dim">{host(j.site?.url)}</div>
              <ul className="cn-check">
                <li className="done">Website paired with a one-time code</li>
                <li className="done">{j.industry} rulebook applied · {j.rules.length} deterministic rules</li>
                {j.agents.map((a) => (
                  <li key={a.id} className={a.online ? 'done' : 'wait'}>
                    {a.name} {a.online ? 'online' : 'coming online…'}
                  </li>
                ))}
              </ul>
              <div className="row" style={{ gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                <Link className="btn btn-solid" href="/fleet">
                  Live monitor
                </Link>
                <button className="btn btn-ghost" onClick={() => setJoined(null)}>
                  Add another
                </button>
              </div>
            </div>
          ) : s?.pending ? (
            <>
              <div className="cn-label">Pairing code</div>
              <div className="cn-code" aria-label={`Pairing code ${s.pending.code.split('').join(' ')}`}>
                {s.pending.code.split('').map((ch, i) => (
                  <span key={i} style={{ animationDelay: `${i * 0.06}s` }}>
                    {ch}
                  </span>
                ))}
              </div>
              <div className="cn-wait">
                <span className="live-dot" style={{ background: 'var(--human)' }} /> Waiting for a website · {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
              </div>
              <p className="cn-copy">Enter it on the company’s website, in its admin.</p>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void post({ action: 'code' })}>
                New code
              </button>
            </>
          ) : (
            <>
              <div className="cn-label">Add a company</div>
              <p className="cn-copy">Generate a one-time code and give it to the company’s admin. Their website introduces itself; their agents come online here.</p>
              <button className="btn btn-solid cn-go" disabled={busy} onClick={() => void post({ action: 'code' })}>
                Generate pairing code
              </button>
            </>
          )}
            </>
          )}
          {s && s.log.length > 0 && (
            <details className="cn-log">
              <summary>Activity · {s.log.length}</summary>
              {s.log.map((n, i) => (
                <div key={i} className={`cn-note t-${n.tone}`}>
                  <span className="mono dim">{clock(n.at)}</span>
                  <span>{n.text}</span>
                </div>
              ))}
            </details>
          )}
        </section>

        <section className="cn-list">
          <div className="cn-list-h">
            In Abhed <span className="dim">{s ? s.companies.length + gw.length : '…'}</span>
          </div>
          {s && s.companies.length + gw.length === 0 && <div className="panel dim">No companies yet.</div>}
          {gw.map((c) => (
            <GwRow key={c.id} c={c} open={open === `gw:${c.id}`} toggle={() => setOpen(open === `gw:${c.id}` ? null : `gw:${c.id}`)} fresh={created?.id === c.id} busy={busy} post={gpost} withPin={async (label, body) => { const pin = window.prompt(`${label}\nPIN:`); if (!pin) return; if (await gpost({ ...body, pin })) setCreated(null); }} onKey={(key) => { setMode('nocode'); setCreated({ id: c.id, key }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
          ))}
          {s?.companies.map((c) => {
            const on = c.agents.filter((a) => a.online).length;
            const isOpen = open === c.tenant;
            return (
              <article key={c.tenant} className={`panel cn-co ${isOpen ? 'open' : ''} ${joined === c.tenant ? 'fresh' : ''}`}>
                <button className="cn-row" onClick={() => setOpen(isOpen ? null : c.tenant)} aria-expanded={isOpen}>
                  <span className="cn-av">{c.company[0]}</span>
                  <span className="cn-row-m">
                    <b>{c.company}</b>
                    <span className="dim">
                      {c.industry} · {host(c.site?.url) || 'setup'}
                    </span>
                  </span>
                  <span className={`cn-on ${on ? 'yes' : ''}`}>
                    <i /> {on}/{c.agents.length} online
                  </span>
                  <span className="cn-chev" aria-hidden="true">
                    ›
                  </span>
                </button>
                {isOpen && (
                  <div className="cn-detail">
                    <div className="cn-sec">
                      <div className="cn-sec-h">Agents</div>
                      {c.agents.map((a) => (
                        <div key={a.id} className={`cn-agent ${a.online ? 'on' : ''}`}>
                          <b>{a.name}</b>
                          <span className="dim">{a.job}</span>
                          <span className="cn-hb">
                            <i />
                            {a.online ? `${Math.max(0, Math.round((now - (a.lastSeen ?? now)) / 1000))}s ago` : 'off'}
                          </span>
                        </div>
                      ))}
                    </div>
                    <details className="cn-sec">
                      <summary className="cn-sec-h">Rulebook · {c.rules.length} deterministic rules</summary>
                      {c.rules.map((r) => (
                        <div key={r.id} className="cn-rule">
                          <span className="mono">{r.id}</span> {r.says}
                        </div>
                      ))}
                      <Link className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} href="/rules">
                        Add the company’s own rule
                      </Link>
                    </details>
                    <div className="cn-sec">
                      <div className="cn-sec-h">Live</div>
                      {c.pending.map((p) => (
                        <Link key={p.id} href={`/approve/${p.id}`} className="cn-pend">
                          <span className="chip chip-human">Waiting for a person</span> {p.summary}
                        </Link>
                      ))}
                      {c.activity.length === 0 && c.timeline.length === 0 && <div className="dim">Nothing yet.</div>}
                      {c.activity.slice(0, 6).map((a) => (
                        <div key={a.seq} className="cn-act">
                          <span>
                            <b>{a.actor}</b> {a.action.replace(/_/g, ' ')}
                          </span>
                          <span className={`chip chip-${(DECISION[a.decision] ?? ['muted'])[0]}`}>{(DECISION[a.decision] ?? ['', a.decision])[1]}</span>
                        </div>
                      ))}
                      {c.timeline.slice(0, 5).map((n, i) => (
                        <div key={i} className={`cn-note t-${n.tone}`}>
                          <span className="mono dim">{clock(n.at)}</span>
                          <span>{n.text}</span>
                        </div>
                      ))}
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      {c.site && (
                        <a className="btn btn-ghost btn-sm" href={c.site.url} target="_blank" rel="noreferrer">
                          Open website ↗
                        </a>
                      )}
                      <button className="btn btn-ghost btn-sm btn-danger" disabled={busy} onClick={() => void withPin(`Remove ${c.company} from Abhed? Its data is wiped and its agents are cut off.`, { action: 'remove', tenant: c.tenant })}>
                        Remove company
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function GwRow({ c, open, toggle, fresh, busy, post, withPin, onKey }: { c: GwCompany; open: boolean; toggle: () => void; fresh: boolean; busy: boolean; post: (b: Record<string, unknown>) => Promise<Record<string, unknown> | null>; withPin: (label: string, body: Record<string, unknown>) => Promise<void>; onKey: (key: string) => void }) {
  const on = c.agents.filter((a) => a.online).length;
  const [rules, setRules] = useState({ hold: String(c.rules.holdAbove), block: String(c.rules.blockAbove), tools: c.rules.blockTools.join(', ') });
  return (
    <article className={`panel cn-co ${open ? 'open' : ''} ${fresh ? 'fresh' : ''}`}>
      <button className="cn-row" onClick={toggle} aria-expanded={open}>
        <span className="cn-av">{c.name[0]}</span>
        <span className="cn-row-m">
          <b>
            {c.name} <span className="chip chip-muted">no code</span>
          </b>
          <span className="dim">
            AI gateway · {c.firstCallAt ? `${c.agents.length} agent${c.agents.length === 1 ? '' : 's'} discovered` : c.linkedAt ? 'key verified · waiting for the first agent message' : 'waiting for the company to paste the key'}
            {c.holds.length ? ` · ${c.holds.length} waiting for a person` : ''}
          </span>
        </span>
        <span className={`cn-on ${on ? 'yes' : ''}`}>
          <i /> {on}/{c.agents.length} active
        </span>
        <span className="cn-chev" aria-hidden="true">
          ›
        </span>
      </button>
      {open && (
        <div className="cn-detail">
          {c.holds.length > 0 && (
            <div className="cn-sec">
              <div className="cn-sec-h" style={{ color: 'var(--human)' }}>
                Waiting for a person
              </div>
              {c.holds.map((h) => (
                <div key={h.id} className="cn-hold">
                  <div>
                    <b>{h.agent}</b> wants <span className="mono">{h.tool}</span>
                    <div className="dim">{h.reason}</div>
                    <div className="mono dim" style={{ fontSize: 11.5 }}>
                      {h.args}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-solid btn-sm" disabled={busy} onClick={() => void post({ action: 'decide', holdId: h.id, decision: 'approve', by: 'Guest Judge' })}>
                      Approve
                    </button>
                    <button className="btn btn-ghost btn-sm btn-danger" disabled={busy} onClick={() => void post({ action: 'decide', holdId: h.id, decision: 'reject', by: 'Guest Judge' })}>
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="cn-sec">
            <div className="cn-sec-h">Agents · discovered from their own system prompts</div>
            {c.agents.length === 0 && <div className="dim">None yet. They appear on their first model call.</div>}
            {c.agents.map((a) => (
              <div key={a.id} className={`cn-agent ${a.online ? 'on' : ''}`}>
                <b>{a.name}</b>
                <span className="dim">
                  {a.calls} calls · {a.toolCalls} actions · {a.blocked} stopped · {a.held} held
                </span>
                <span className="cn-hb">
                  <i />
                  {a.online ? 'active' : 'idle'}
                </span>
              </div>
            ))}
          </div>
          <div className="cn-sec">
            <div className="cn-sec-h">Live</div>
            {c.events.length === 0 && <div className="dim">Nothing yet.</div>}
            {c.events.slice(0, 10).map((e) => (
              <div key={e.id} className={`cn-gev k-${e.kind}`}>
                <span className="mono dim">{clock(e.at)}</span>
                <span>
                  {e.agent && <b>{e.agent} </b>}
                  {e.kind === 'tool' ? <span className="mono">{e.tool}</span> : e.kind === 'call' ? <span className="dim">asked: “{e.text}”</span> : e.text}
                  {e.kind === 'tool' && e.decision !== 'ALLOWED' && <div className="dim">{e.text}</div>}
                </span>
                {e.decision ? <span className={`chip chip-${(DECISION[e.decision] ?? (e.decision === 'APPROVED' ? ['allow'] : e.decision === 'REJECTED' ? ['block'] : ['muted']))[0]}`}>{(DECISION[e.decision] ?? ['', e.decision === 'APPROVED' ? 'Approved' : e.decision === 'REJECTED' ? 'Rejected' : e.decision])[1]}</span> : <span />}
              </div>
            ))}
          </div>
          <details className="cn-sec">
            <summary className="cn-sec-h">Company rules · on top of Abhed’s rulebook</summary>
            <div className="cn-rules">
              <label>
                Ask a person above ₹
                <input className="input" value={rules.hold} onChange={(e) => setRules({ ...rules, hold: e.target.value.replace(/\D/g, '') })} />
              </label>
              <label>
                Never above ₹
                <input className="input" value={rules.block} onChange={(e) => setRules({ ...rules, block: e.target.value.replace(/\D/g, '') })} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Tools switched off (comma separated)
                <input className="input" placeholder="e.g. delete_customer, update_role" value={rules.tools} onChange={(e) => setRules({ ...rules, tools: e.target.value })} />
              </label>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} disabled={busy} onClick={() => void post({ action: 'rules', id: c.id, holdAbove: Number(rules.hold), blockAbove: Number(rules.block), blockTools: rules.tools.split(',').map((x) => x.trim()).filter(Boolean) })}>
              Save rules
            </button>
          </details>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {c.site && (
              <a className="btn btn-ghost btn-sm" href={c.site} target="_blank" rel="noreferrer">
                Open website ↗
              </a>
            )}
            <button
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={async () => {
                const j = await post({ action: 'rotate', id: c.id });
                if (j?.key) onKey(String(j.key));
              }}
            >
              New key
            </button>
            <button className="btn btn-ghost btn-sm btn-danger" disabled={busy} onClick={() => void withPin(`Remove ${c.name} from Abhed? Its key stops working.`, { action: 'remove', id: c.id })}>
              Remove company
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
