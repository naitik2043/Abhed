'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ago, Chip, hhmm, Qr, useWorld } from '@/components/app';
import { Band } from '@/components/ambient';
import { BigSpeedChart, Donut, HBars, PALETTE } from '@/components/charts';

type Step = { at: number; kind: string; text?: string; action?: string; decision?: string; reason?: string; ruleRef?: string; approvalId?: string; gatewayMs?: number; params?: Record<string, unknown> };
type Agent = { id: string; name: string; onSite?: boolean; trust?: { score: number; band: string; recommendation: string }; owner: string; status: string; statusReason?: string; purpose?: string; actions: number; auto: number; held: number; blocked: number; tokens: number; costInr: number; valueInr: number; riskScore: number; llmCalls: number };
type Series = { bucketMs: number; points: { t: number; auto: number; held: number; blocked: number; p95ms: number | null }[] };
interface Fleet {
  now: number;
  llm: boolean;
  overall: { bucketMs: number; points: { t: number; auto: number; held: number; blocked: number; p95: number; p50: number }[] };
  pulse: { perMin: number; last5: number; refused5: number; held5: number; online: number; connected: number; p95_5m: number | null };
  companies: {
    tenant: string;
    company: string;
    label: string;
    site: string;
    connection?: 'connected' | 'waiting' | 'disconnected';
    agents: Agent[];
    mix: { total: number; auto: number; held: number; blocked: number; autoPct: number | null; heldPct: number | null };
    speed: { measured: number; p50ms: number | null; p95ms: number | null };
    human: { decided: number; pending: number; medianWaitS: number | null };
    series: Series;
    reasons: { rule: string; says: string; count: number }[];
    blockReasons: { category: string; count: number }[];
    approvals: Record<string, number>;
    people: number;
    integrity: { ledger: boolean; chain: boolean; blocks: number; records: number };
    incidents: number;
  }[];
  sessions: { id: string; company: string; tenant: string; agentId: string; agentName: string; owner: string; command: string; by: string; status: string; planner: string; model?: string; tokens: number; costInr: number; steps: Step[]; updatedAt: number; pendingApprovalId?: string; injection?: string[] }[];
  pending: { id: string; tenant: string; company: string; summary: string; why: string; approverRole: string; twoKey: number; votes: string[]; createdAt: number }[];
  decided: { id: string; company: string; summary: string; status: string; by: string; at: number; waitS: number }[];
  feed: { seq: number; ts: number; company: string; actor: string; action: string; decision: string; reason: string; ruleRef?: string; ms?: number; approvers: string[]; desc?: string }[];
  security: { at: number; kind: string; detail: string; owasp: string; severity: string; company: string }[];
  approvers: { name: string; online: boolean; push: boolean; device: string }[];
}

const TONE: Record<string, string> = { banking: 'var(--ink)', healthcare: 'var(--muted)', ecommerce: 'var(--muted-2)' };
const short = (c: string) => c.replace(' (fictional)', '');

export default function FleetPage() {
  const { run, toast } = useWorld();
  const [f, setF] = useState<Fleet | null>(null);
  const [origin, setOrigin] = useState('');
  const [openAgent, setOpenAgent] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [gw, setGw] = useState<{ id: string; name: string; site?: string; agents: { id: string; name: string; calls: number; toolCalls: number; blocked: number; held: number; online: boolean }[]; holds: unknown[]; events: { id: number; agent: string; kind: string; text: string; tool?: string; decision?: string }[] }[]>([]);
  const load = useCallback(async () => {
    try {
      const [r, g] = await Promise.all([fetch('/api/fleet', { cache: 'no-store' }), fetch('/api/gateway', { cache: 'no-store' })]);
      if (r.ok) setF(await r.json());
      if (g.ok) setGw(((await g.json()) as { companies: typeof gw }).companies);
    } catch {
      /* keep last */
    }
  }, []);
  useEffect(() => {
    setOrigin(window.location.origin);
    load();
    const t = setInterval(load, 1200);
    return () => clearInterval(t);
  }, [load]);

  if (!f) return <main className="page muted">Connecting to the fleet…</main>;
  const all = f.companies.flatMap((c) => c.agents);
  const tot = f.companies.reduce((s, c) => ({ total: s.total + c.mix.total, auto: s.auto + c.mix.auto, held: s.held + c.mix.held, blocked: s.blocked + c.mix.blocked }), { total: 0, auto: 0, held: 0, blocked: 0 });
  const p95 = Math.max(0, ...f.companies.map((c) => c.speed.p95ms ?? 0));
  const p50s = f.companies.map((c) => c.speed.p50ms).filter((x): x is number => x !== null);
  const waits = f.companies.map((c) => c.human.medianWaitS).filter((x): x is number => x !== null);
  const act = async (tenant: string, type: string, agentId: string) => {
    // pausing is anyone's right; resuming belongs to the agent's owner (the command route defaults to them)
    const r = await run(type, type === 'pause' ? { tenant, agentId, by: 'judge', reason: 'Paused from the fleet dashboard' } : { tenant, agentId, reason: 'Reviewed and resumed from the fleet dashboard' });
    if (r.ok) toast(`${agentId} ${type === 'pause' ? 'paused: key revoked' : 'resumed'}`, type === 'pause' ? 'block' : 'allow');
    load();
  };

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Fleet <em>· live</em>
          </h1>
          <p className="page-sub">
            {f.companies.length} {f.companies.length === 1 ? 'company' : 'companies'} · {all.length} governed agents · every action, as it happens
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className={`chip ${f.llm ? 'chip-allow' : 'chip-warn'}`}>{f.llm ? 'LLM live' : 'LLM offline'}</span>
          <span className="chip chip-muted">
            {f.approvers.filter((a) => a.online).length} phone{f.approvers.filter((a) => a.online).length === 1 ? '' : 's'} on duty
          </span>
          <a className="btn btn-ghost btn-sm" href="/api/audit?by=Judge" download title="Audit report (PDF)">
            ⤓ Audit PDF
          </a>
        </div>
      </div>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
        <Kpi label="Agent actions decided" value={tot.total.toLocaleString('en-IN')} note="measured on this deployment" />
        <Kpi label="Ran on their own" value={tot.total ? `${Math.round((tot.auto / tot.total) * 100)}%` : '—'} note={`${tot.auto} low-impact actions`} color="var(--allow)" />
        <Kpi label="Asked a person" value={tot.total ? `${Math.round((tot.held / tot.total) * 100)}%` : '—'} note={`${tot.held} high-impact only`} color="var(--human)" />
        <Kpi label="Refused" value={String(tot.blocked)} note="policy, grounding, DLP" color="var(--block)" />
        <Kpi label="Gateway decision" value={p50s.length ? `${Math.max(...p50s).toFixed(1)} ms` : '—'} note={`p95 ${p95 ? p95.toFixed(1) : '—'} ms · security adds ~nothing`} />
        <Kpi label="Human wait (median)" value={waits.length ? `${Math.max(...waits)} s` : '—'} note={`${f.pending.length} waiting now`} />
      </div>

      <Band>
      <section className="fl-mon">
        <div className="panel fl-speed">
          <div className="panel-title">
            <span>
              <b>Speed vs control</b> · every agent action across all companies, by outcome
            </span>
            <span>{f.overall.bucketMs === 120_000 ? 'last hour · live' : 'last 24 h'}</span>
          </div>
          <BigSpeedChart points={f.overall.points} bucketMs={f.overall.bucketMs} />
          <div className="fl-legend">
            <span>
              <i style={{ background: 'var(--allow)' }} /> ran on its own
            </span>
            <span>
              <i style={{ background: 'var(--human)' }} /> asked a person
            </span>
            <span>
              <i style={{ background: 'var(--block)' }} /> refused at the gate
            </span>
            <span>
              <i className="dash" /> gateway p95 (ms)
            </span>
          </div>
        </div>
        <div className="panel fl-now">
          <div className="panel-title">
            <span>
              <b>Right now</b>
            </span>
            <span className="live-dot" />
          </div>
          <div className="fl-big">
            <b>{f.pulse.perMin}</b>
            <span>agent decisions in the last minute</span>
          </div>
          <div className="fl-big">
            <b>
              {f.pulse.online + gw.reduce((n, c) => n + c.agents.filter((a) => a.online).length, 0)}
              <small> online</small>
            </b>
            <span>agent processes sending heartbeats</span>
          </div>
          <div className="fl-row">
            <div>
              <b style={{ color: 'var(--block)' }}>{f.pulse.refused5}</b>
              <span>refused · 5 min</span>
            </div>
            <div>
              <b style={{ color: 'var(--human)' }}>{f.pulse.held5}</b>
              <span>to a person · 5 min</span>
            </div>
            <div>
              <b>{f.pulse.p95_5m != null ? `${f.pulse.p95_5m.toFixed(1)}` : '—'}</b>
              <span>p95 ms · 5 min</span>
            </div>
          </div>
          <Link href="/connect" className="fl-conn">
            <span>
              <b>{f.companies.length + gw.length}</b> {f.companies.length + gw.length === 1 ? 'company' : 'companies'} in Abhed
            </span>
            <span>Add a company →</span>
          </Link>
        </div>
      </section>
      </Band>

      <div className="fl-cos">
        {f.companies.map((c) => (
          <div key={c.tenant} className="panel fl-co">
            <div className="fl-co-h">
              <div>
                <div className="fl-co-name">{short(c.company)}</div>
                <div className="dim fl-co-sub">
                  {c.label} · {c.integrity.records} records {c.integrity.ledger && c.integrity.chain ? '· chain ✓' : '· chain ✕'}
                </div>
              </div>
              <a className="btn btn-ghost btn-sm" href={c.site} target="_blank" rel="noopener" title="Open the company website">
                Site ↗
              </a>
            </div>
            <div className="fl-co-stats">
              <span>
                <b>{c.mix.total}</b> actions
              </span>
              <span>
                <b style={{ color: 'var(--human)' }}>{c.mix.held}</b> to a person
              </span>
              <span>
                <b style={{ color: 'var(--block)' }}>{c.mix.blocked}</b> refused
              </span>
            </div>
            {c.agents.map((a) => {
              const key = `${c.tenant}:${a.id}`;
              const isOpen = openAgent === key;
              return (
                <div key={a.id} className={`fl-agent ${isOpen ? 'open' : ''}`}>
                  <button className="fl-agent-row" onClick={() => setOpenAgent(isOpen ? null : key)} aria-expanded={isOpen}>
                    <span className={`fl-dot ${a.status === 'PAUSED' ? 'bad' : 'ok'}`} />
                    <b>{a.name}</b>
                    <span className="dim fl-agent-job">{a.purpose}</span>
                    <span className="dim fl-agent-n">{a.actions}</span>
                    <span className="fl-chev">›</span>
                  </button>
                  {isOpen && (
                    <div className="fl-agent-d">
                      <div className="fl-agent-grid">
                        <span>
                          Owner <b>{a.owner}</b>
                        </span>
                        <span>
                          Status <b style={{ color: a.status === 'PAUSED' ? 'var(--block)' : 'var(--allow)' }}>{a.status.toLowerCase()}</b>
                        </span>
                        {a.trust && (
                          <span>
                            Trust <b>{a.trust.score}</b> · {a.trust.band}
                          </span>
                        )}
                        <span>
                          Asked <b>{a.held}</b> · refused <b>{a.blocked}</b>
                        </span>
                        <span>
                          Tokens <b>{a.tokens.toLocaleString('en-IN')}</b> · ₹{a.costInr.toFixed(2)}
                        </span>
                        <span>
                          Risk <b>{a.riskScore}</b>
                          {a.onSite ? ' · on website' : ''}
                        </span>
                      </div>
                      {a.status === 'PAUSED' && <div className="fl-paused">{a.statusReason}</div>}
                      <div className="row" style={{ gap: 8, marginTop: 12 }}>
                        <a className="btn btn-ghost btn-sm" href={`/api/audit?tenant=${c.tenant}&agent=${a.id}&by=Judge`} download>
                          ⤓ Report
                        </a>
                        {a.status === 'PAUSED' ? (
                          <button className="btn btn-ghost btn-sm" onClick={() => act(c.tenant, 'resume', a.id)}>
                            Resume
                          </button>
                        ) : (
                          <button className="btn btn-ghost btn-sm btn-danger" onClick={() => act(c.tenant, 'pause', a.id)}>
                            Pause
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {gw.map((c) => (
          <div key={c.id} className="panel fl-co">
            <div className="fl-co-h">
              <div>
                <div className="fl-co-name">{c.name}</div>
                <div className="dim fl-co-sub">No code · AI gateway</div>
              </div>
              {c.site && (
                <a className="btn btn-ghost btn-sm" href={c.site} target="_blank" rel="noopener">
                  Site ↗
                </a>
              )}
            </div>
            <div className="fl-co-stats">
              <span>
                <b>{c.agents.reduce((n, a) => n + a.toolCalls, 0)}</b> actions
              </span>
              <span>
                <b style={{ color: 'var(--human)' }}>{c.agents.reduce((n, a) => n + a.held, 0)}</b> to a person
              </span>
              <span>
                <b style={{ color: 'var(--block)' }}>{c.agents.reduce((n, a) => n + a.blocked, 0)}</b> stopped
              </span>
            </div>
            {c.agents.length === 0 && <div className="dim" style={{ padding: '12px 0' }}>Waiting for the first model call…</div>}
            {c.agents.map((a) => (
              <div key={a.id} className="fl-agent">
                <Link className="fl-agent-row" href="/connect">
                  <span className={`fl-dot ${a.online ? 'ok' : 'idle'}`} />
                  <b>{a.name}</b>
                  <span className="dim fl-agent-job">
                    {a.calls} calls · {a.blocked} stopped
                  </span>
                  <span className="dim fl-agent-n">{a.toolCalls}</span>
                  <span className="fl-chev">›</span>
                </Link>
              </div>
            ))}
            {c.holds.length > 0 && (
              <Link href="/connect" className="cn-pend" style={{ marginTop: 10 }}>
                <span className="chip chip-human">Waiting for a person</span> {c.holds.length} action{c.holds.length === 1 ? '' : 's'}
              </Link>
            )}
          </div>
        ))}
        <Link href="/connect" className="panel fl-add">
          <span>+</span>
          Add a company
        </Link>
      </div>

      <FleetCharts f={f} />

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="panel">
          <div className="panel-title">
            <span>
              <b>Agents at work</b> · live sessions from the company sites
            </span>
            <span>{f.sessions.filter((s) => s.status === 'running' || s.status === 'waiting').length} active</span>
          </div>
          {!f.sessions.length && <div className="muted">No sessions yet. Open a company site and ask its agent something.</div>}
          {f.sessions.map((s, i) => {
            const key = `${s.tenant}-${s.id}`;
            const isOpen = openRun ? openRun === key : i === 0 && (s.status === 'running' || s.status === 'waiting');
            return (
              <div key={key} className={`fl-run ${isOpen ? 'open' : ''} st-${s.status}`}>
                <button className="fl-run-h" onClick={() => setOpenRun(isOpen ? '-' : key)} aria-expanded={isOpen}>
                  <b>{s.agentName}</b>
                  <span className="dim fl-run-cmd">“{s.command.replace(/<!--[\s\S]*-->/, '⟨hidden instruction⟩').slice(0, 90)}”</span>
                  <span className={`chip chip-${s.status === 'done' ? 'allow' : s.status === 'waiting' ? 'human' : s.status === 'running' ? 'muted' : 'block'}`}>{s.status === 'running' ? 'working' : s.status}</span>
                  <span className="fl-chev">›</span>
                </button>
                {isOpen && (
                  <div className="fl-run-d">
                    <div className="dim" style={{ fontSize: 12, marginBottom: 8 }}>
                      {short(s.company)} · for {s.by} · {s.model ?? s.planner} · {ago(s.updatedAt, f.now)}
                    </div>
                    {s.steps.map((st, j) => (
                      <div key={j} className={`fl-step k-${st.kind}`}>
                        <span className="mono dim">{hhmm(st.at)}</span>
                        <span style={{ minWidth: 0 }}>
                          {st.kind === 'thought' && <i>{st.text?.slice(0, 140)}</i>}
                          {st.kind === 'action' && (
                            <>
                              <span className="mono">{st.action}</span>
                              {st.decision !== 'ALLOWED' && <div className="muted">{st.reason?.slice(0, 140)}</div>}
                            </>
                          )}
                          {st.kind === 'result' && <span>{st.text}</span>}
                          {st.kind === 'security' && <span style={{ color: 'var(--warn)' }}>{st.text}</span>}
                          {st.kind === 'final' && <span>{st.text?.slice(0, 200)}</span>}
                        </span>
                        <span>
                          {st.decision ? <Chip d={st.decision} /> : null} {st.gatewayMs !== undefined && <span className="mono dim">{st.gatewayMs}ms</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {f.pending.map((p) => (
            <div key={p.id} className="panel waiting">
              <div className="panel-title">
                <span>
                  <b style={{ color: 'var(--human)' }}>Waiting for a person</b> · {short(p.company)}
                </span>
                <span className="mono">{p.id}</span>
              </div>
              <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 120, flex: 'none' }}>{origin && <Qr url={`${origin}/approve/${p.id}`} />}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{p.summary}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                    {p.why}
                  </div>
                  <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>
                    {p.approverRole.replace('_', ' ')}
                    {p.twoKey > 1 ? ` · two people (${p.votes.length}/${p.twoKey})` : ''} · asked {ago(p.createdAt, f.now)} · scan to decide
                  </div>
                  <Link className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} href={`/approve/${p.id}`} target="_blank">
                    Open approval ↗
                  </Link>
                </div>
              </div>
            </div>
          ))}

          <div className="panel">
            <div className="panel-title">
              <span>
                <b>Who approved what</b> · accountability
              </span>
            </div>
            {!f.decided.length && <div className="muted">No approvals decided yet.</div>}
            {f.decided.map((d) => (
              <div key={d.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border-soft)', fontSize: 12.5 }}>
                <div className="row between">
                  <span>
                    <span className="mono">{d.id}</span> · {d.summary}
                  </span>
                  <Chip d={d.status} />
                </div>
                <div className="muted" style={{ fontSize: 11.5 }}>
                  {short(d.company)} · by {d.by} · waited {d.waitS}s
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-title">
              <span>
                <b>Decision stream</b> · all companies
              </span>
              <Link href="/ledger" className="muted">
                ledger →
              </Link>
            </div>
            <div className="feed" style={{ maxHeight: 330 }}>
              {f.feed.map((r) => (
                <div key={`${r.company}-${r.seq}`} className="feed-row" style={{ gridTemplateColumns: '58px 92px 1fr auto' }}>
                  <span className="mono dim">{hhmm(r.ts)}</span>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {short(r.company)}
                  </span>
                  <span className="what" title={r.reason}>
                    <b style={{ fontWeight: 500 }}>{r.actor}</b> · {r.desc ?? r.action}
                    {r.approvers?.length ? ` · ✓ ${r.approvers.join(' + ')}` : ''}
                  </span>
                  <Chip d={r.decision} />
                </div>
              ))}
            </div>
          </div>

          {f.security.length > 0 && (
            <div className="panel">
              <div className="panel-title">
                <span>
                  <b>Security events</b>
                </span>
                <Link href="/security" className="muted">
                  security →
                </Link>
              </div>
              {f.security.map((s, i) => (
                <div key={i} style={{ padding: '5px 0', borderTop: '1px solid var(--border-soft)', fontSize: 12 }}>
                  <span className={`chip chip-${s.severity === 'critical' || s.severity === 'high' ? 'block' : 'warn'}`}>{s.severity}</span> {s.kind} · {short(s.company)}
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {s.owasp} · {s.detail.slice(0, 140)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function FleetCharts({ f }: { f: Fleet }) {
  const sum = (k: 'auto' | 'held' | 'blocked') => f.companies.reduce((s, c) => s + c.mix[k], 0);
  const approvals: Record<string, number> = {};
  for (const c of f.companies) for (const [k, v] of Object.entries(c.approvals)) approvals[k] = (approvals[k] ?? 0) + v;
  const reasons: Record<string, number> = {};
  for (const c of f.companies) for (const b of c.blockReasons) reasons[b.category] = (reasons[b.category] ?? 0) + b.count;
  const tone: Record<string, string> = { EXECUTED: 'var(--allow)', PENDING: 'var(--human)', 'ON HOLD': 'var(--warn)', REJECTED: 'var(--block)', EXPIRED: 'var(--muted-2)', VOID: '#9a9a9a', APPROVED: 'var(--allow)' };
  const agents = f.companies.flatMap((c) => c.agents.map((a) => ({ ...a, company: c.tenant }))).filter((a) => a.actions).sort((a, b) => b.actions - a.actions).slice(0, 7);
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginBottom: 14 }}>
      <div className="panel">
        <div className="panel-title">
          <span>
            <b>What agents did</b>
          </span>
        </div>
        <Donut label="actions" slices={[{ label: 'on their own', value: sum('auto'), color: 'var(--allow)' }, { label: 'asked a person', value: sum('held'), color: 'var(--human)' }, { label: 'refused', value: sum('blocked'), color: 'var(--block)' }]} />
      </div>
      <div className="panel">
        <div className="panel-title">
          <span>
            <b>Approvals</b> by outcome
          </span>
        </div>
        <Donut label="requests" slices={Object.entries(approvals).map(([k, v]) => ({ label: k.toLowerCase(), value: v, color: tone[k] ?? 'var(--info)' }))} />
      </div>
      <div className="panel">
        <div className="panel-title">
          <span>
            <b>Why refused</b>
          </span>
        </div>
        <Donut label="refused" slices={Object.entries(reasons).map(([k, v], i) => ({ label: k, value: v, color: PALETTE[i % PALETTE.length] }))} />
      </div>
      <div className="panel">
        <div className="panel-title">
          <span>
            <b>Busiest agents</b>
          </span>
        </div>
        <HBars items={agents.map((a) => ({ label: a.name, note: short(f.companies.find((c) => c.tenant === a.company)?.company ?? ''), value: a.actions, color: TONE[a.company] }))} />
      </div>
    </div>
  );
}

function Kpi({ label, value, note, color }: { label: string; value: string; note: string; color?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="kpi-note">{note}</div>
    </div>
  );
}
