'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';
import { Chip, Qr, ago, hhmm, inr, useWorld } from '@/components/app';
import { LiveFloor, LiveWire, PhonesPanel } from '@/components/live';
import type { Approval } from '@/lib/types';

function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((until - now) / 1000));
  return <span className="mono">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</span>;
}

function WaitingPanel() {
  const { view, run, busy } = useWorld();
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  if (!view) return null;
  const pending = view.approvals.filter((a) => a.status === 'PENDING');
  const recent = view.approvals.find((a) => a.status === 'EXECUTED' && a.votes.length && view.now - (a.usedAt ?? 0) < 25_000);
  const ap: Approval | undefined = pending[0];

  if (ap) {
    const url = `${origin}/approve/${ap.id}`;
    return (
      <div className="panel waiting">
        <div className="panel-title">
          <span style={{ color: 'var(--human)' }}>● Waiting for a person</span>
          <span className="mono" style={{ color: 'var(--human)' }}>
            {ap.id} · <Countdown until={ap.expiresAt} />
          </span>
        </div>
        <div style={{ fontSize: 19, fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.25 }}>{ap.summary}</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{ap.why}</div>
        <div className="row" style={{ marginTop: 14, alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 170, flex: 'none' }}>
            <Qr url={url} />
          </div>
          <div className="stack" style={{ gap: 8, fontSize: 12.5 }}>
            <div>
              <div className="badge-k">Scan to approve</div>
              <div style={{ marginTop: 4 }}>The approver decides on their own phone. Their name goes into the ledger.</div>
            </div>
            <div className="muted">
              Needs <b style={{ color: 'var(--ink)' }}>{ap.approverRole.replace('_', ' ').toUpperCase()}</b>
              {ap.twoKey > 1 ? ` · two keys (${ap.votes.length}/${ap.twoKey})` : ''}
              {ap.escalationLevel > 0 ? ` · escalated ×${ap.escalationLevel}` : ''}
            </div>
            <div className="mono dim" title={ap.actionHash}>
              bound to {ap.actionHash.slice(0, 16)}…
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noreferrer">
                Open card
              </a>
              <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('presenter_approve', { approvalId: ap.id, name: ap.ownerId === 'meera' ? 'Arjun Rao' : 'Meera Iyer' })}>
                Approve here (fallback)
              </button>
            </div>
          </div>
        </div>
        {pending.length > 1 && <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>+{pending.length - 1} more waiting</div>}
      </div>
    );
  }

  if (recent) {
    const flagged = view.oversight.find((o) => o.approvalId === recent.id);
    return (
      <div className="panel" style={{ borderColor: 'color-mix(in srgb, var(--allow) 55%, transparent)' }}>
        <div className="panel-title">
          <span style={{ color: 'var(--allow)' }}>● Approved by a person</span>
          <span className="mono">record #{recent.executedSeq}</span>
        </div>
        <div style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.035em', lineHeight: 1.15 }}>
          {recent.votes.map((v) => v.name).join(' + ')} <span className="serif muted">approved</span>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>{recent.summary}. Executed once, for exactly this action.</div>
        {flagged && (
          <div className="panel" style={{ marginTop: 12, borderColor: 'color-mix(in srgb, var(--warn) 60%, transparent)', background: 'rgba(232,198,106,0.06)' }}>
            <div className="badge-k" style={{ color: 'var(--warn)' }}>Oversight noticed</div>
            <div style={{ marginTop: 4 }}>{flagged.note} Abhed governs the humans too.</div>
          </div>
        )}
        <div className="muted" style={{ marginTop: 12, fontSize: 12.5 }}>
          Press <span className="mono">2</span>: Rex tries to reuse it for ₹1 more.
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <span>Waiting for a person</span>
        <span className="mono">0</span>
      </div>
      <div style={{ fontSize: 18, letterSpacing: '-0.02em' }}>
        Nothing is waiting. <span className="serif muted">Agents are inside their limits.</span>
      </div>
      <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
        Press <span className="mono">1</span> to have Rex, a real planning agent, pick up VIP ticket #8811.
      </div>
      <div className="hr" />
      <div className="panel-title" style={{ marginBottom: 8 }}>
        <span>PS5 coverage · ticks as it happens</span>
      </div>
      <div className="checklist">
        {view.checklist.map((c) => (
          <div key={c.id} className={`check ${c.done ? 'on' : ''}`}>
            <i>{c.done ? '✓' : ''}</i>
            <b className="mono" style={{ fontWeight: 400, width: 22 }}>{c.id}</b> {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentTable() {
  const { view, run, busy } = useWorld();
  const [open, setOpen] = useState<string | null>(null);
  if (!view) return null;
  return (
    <div className="panel" style={{ overflowX: 'auto' }}>
      <div className="panel-title">
        <span>
          <b>Workforce registry</b> · agent P&amp;L · every number from the ledger
        </span>
        <span>click an agent for its passport</span>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Owner (accountable)</th>
            <th>Purpose</th>
            <th>Risk</th>
            <th className="r">Tasks 24h</th>
            <th className="r">Auto</th>
            <th className="r">AI cost</th>
            <th className="r">Value</th>
            <th>Status</th>
            <th className="r">Control</th>
          </tr>
        </thead>
        <tbody>
          {view.agents.map((a) => (
            <Fragment key={a.id}>
              <tr className={`clickable ${a.status === 'PAUSED' ? 'shield-close' : ''}`} onClick={() => setOpen(open === a.id ? null : a.id)}>
                <td>
                  <div style={{ fontWeight: 500 }}>{a.name}</div>
                  <div className="dim" style={{ fontSize: 11.5 }}>
                    {a.framework} · {a.autonomy}
                  </div>
                </td>
                <td>{a.ownerName}</td>
                <td className="muted">{a.purpose}</td>
                <td>
                  <span className={`chip chip-${a.risk === 'CRITICAL' ? 'block' : a.risk === 'HIGH' ? 'warn' : 'muted'}`}>{a.risk}</span>
                </td>
                <td className="r num">{a.tasks}</td>
                <td className="r num">{a.autoPct}%</td>
                <td className="r num">{inr(a.cost)}</td>
                <td className="r num">{inr(a.value)}</td>
                <td>
                  <Chip d={a.status} />
                  {a.waiting > 0 && <span className="chip chip-human" style={{ marginLeft: 6 }}>{a.waiting} held</span>}
                </td>
                <td className="r" onClick={(e) => e.stopPropagation()}>
                  {a.status === 'ACTIVE' ? (
                    <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('restrict', { agentId: a.id, by: a.owner })}>
                        Restrict
                      </button>
                      <button className="btn btn-ghost btn-sm btn-danger" disabled={!!busy} onClick={() => run('pause', { agentId: a.id, by: a.owner, reason: 'Paused by owner from the Command Center' })}>
                        Pause
                      </button>
                    </span>
                  ) : (
                    <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run('resume', { agentId: a.id, by: a.owner, reason: 'Reviewed and resumed by owner' })} title={`Only ${a.ownerName} can resume`}>
                      Resume as {a.ownerName.split(' ')[0]}
                    </button>
                  )}
                </td>
              </tr>
              {open === a.id && (
                <tr>
                  <td colSpan={10} style={{ background: 'var(--surface-2)' }}>
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', fontSize: 12.5 }}>
                      <div>
                        <div className="badge-k">Passport</div>
                        <div style={{ marginTop: 4 }}>
                          {a.model} <span className="dim">({a.modelVersion})</span>
                        </div>
                        <div className="muted">Autonomy {a.autonomy} · budget {inr(a.budgetInr)}/day</div>
                        {a.statusReason && <div style={{ color: 'var(--block)', marginTop: 4 }}>{a.statusReason} · {a.statusBy}</div>}
                      </div>
                      <div>
                        <div className="badge-k">Delegations (human grants)</div>
                        {a.delegations.map((d) => (
                          <div key={d.action} style={{ marginTop: 4 }}>
                            {d.action.replace(/_/g, ' ')}
                            {d.maxPerAction ? ` ≤ ${inr(d.maxPerAction)}` : ''}
                            {d.maxPerDay ? ` · ${inr(d.maxPerDay)}/day` : ''}{' '}
                            <span className="dim">by {view.humans.find((h) => h.id === d.grantedBy)?.name}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="badge-k">Data access</div>
                        {a.dataScopes.map((d) => (
                          <div key={d} style={{ marginTop: 4 }}>
                            {d}
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="badge-k">Today</div>
                        <div style={{ marginTop: 4 }}>
                          {a.blocked} blocked · {a.openTickets} open tickets · {inr(a.spentToday)} refunded
                        </div>
                        <div className="muted">Key {a.keyRevoked ? 'revoked' : 'live (Abhed-issued, never the provider key)'}</div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function decisionTone(d: string) {
  return d === 'ALLOWED' || d === 'EXECUTED' ? 'allow' : d === 'NEEDS_APPROVAL' ? 'human' : d === 'BLOCKED' || d === 'VOID' || d === 'PAUSED' ? 'block' : d === 'FLAG' ? 'warn' : 'ledger';
}

function LiveFeed() {
  const { view } = useWorld();
  if (!view) return null;
  return (
    <div className="panel">
      <div className="panel-title">
        <span>
          <b>Live ledger</b> · people + agents, one trail
        </span>
        <Link href="/ledger" className="muted">
          all {view.ledgerTotal} →
        </Link>
      </div>
      <div className="feed">
        {view.ledger.slice(0, 22).map((r) => (
          <div key={r.seq} className="feed-row">
            <span className="mono dim">#{r.seq}</span>
            <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.actorName}</span>
            <span className="what muted" title={r.reason}>
              {String(r.meta?.desc ?? r.action.replace(/_/g, ' ')).replace(`${r.actorName} → `, '')}
              {r.approvers.length ? ` · by ${r.approvers.join(' + ')}` : ''}
            </span>
            <span className={`chip chip-${decisionTone(r.decision)}`}>{r.decision === 'NEEDS_APPROVAL' ? 'Held' : r.decision === 'INFO' ? 'Logged' : r.decision.toLowerCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const LANES = [
  ['AGENT', 'Agent', 'var(--allow)', 'Inside its limits'],
  ['AGENT_REVIEW', 'Agent + review', 'var(--warn)', 'A person checks after'],
  ['HUMAN', 'Human', 'var(--info)', 'People only'],
  ['ESCALATED', 'Escalated', 'var(--human)', 'Waiting on a decision'],
  ['EXCEPTION', 'Exceptions', 'var(--block)', 'Stopped by a rule'],
] as const;
const SHOWN = 4;

function WorkBoard() {
  const { view } = useWorld();
  if (!view) return null;
  const who = (id: string) => {
    const a = view.agents.find((x) => x.id === id);
    if (a) return { name: a.name, agent: true };
    return { name: view.humans.find((h) => h.id === id)?.name ?? id, agent: false };
  };
  const open = view.tickets.filter((t) => t.lane !== 'DONE');
  return (
    <section className="panel wb" aria-label="Work board">
      <div className="wb-head">
        <div>
          <h2>Work board</h2>
          <p>Who handles each open ticket, a person or an agent, and the rule that put it there.</p>
        </div>
        <div className="wb-total">
          <b>{open.length}</b>
          <span>open tickets</span>
        </div>
      </div>
      <div className="wb-lanes">
        {LANES.map(([key, label, color, hint]) => {
          // oldest first, so cards keep their place as new work arrives
          const ts = view.tickets.filter((t) => t.lane === key).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
          return (
            <div className="wb-lane" key={key} style={{ '--lane': color } as React.CSSProperties}>
              <header>
                <i aria-hidden="true" />
                <div>
                  <h3>{label}</h3>
                  <p>{hint}</p>
                </div>
                <b aria-label={`${ts.length} tickets`}>{ts.length}</b>
              </header>
              <div className="wb-cards">
                {ts.slice(0, SHOWN).map((t) => {
                  const w = who(t.assignee);
                  return (
                    <article className="wb-card" key={t.id} title={`${t.subject}\n${w.name} · ${t.why}`}>
                      <div className="wb-card-top">
                        <span className="wb-id">{t.id}</span>
                        <span className="wb-ch">{t.channel}</span>
                        {t.vip && <span className="wb-vip">VIP</span>}
                      </div>
                      <h4>{t.subject}</h4>
                      <p className="wb-why">{t.why}</p>
                      <div className="wb-who">
                        <span className={`wb-av ${w.agent ? 'agent' : ''}`} aria-hidden="true">
                          {w.name.slice(0, 1)}
                        </span>
                        <span>{w.name}</span>
                        <em>{w.agent ? 'agent' : 'person'}</em>
                      </div>
                    </article>
                  );
                })}
                {ts.length === 0 && <div className="wb-empty">Nothing here right now</div>}
              </div>
              <footer>{ts.length > SHOWN ? `+${ts.length - SHOWN} more in this lane` : ts.length ? 'All shown' : '\u00a0'}</footer>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SidePanels() {
  const { view } = useWorld();
  if (!view) return null;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="panel">
        <div className="panel-title">
          <span>
            <b>Agent reasoning</b> · untrusted, shown for context
          </span>
          {view.llm ? <span className="chip chip-allow">LLM live</span> : <span className="chip chip-muted">planner: rule-based</span>}
        </div>
        {view.agentTrace.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Agents are working quietly inside their limits.</div>}
        <div className="stack" style={{ gap: 6 }}>
          {view.agentTrace.slice(0, 6).map((t, i) => (
            <div key={i} className="row" style={{ fontSize: 12.5, alignItems: 'flex-start' }}>
              <span className="mono dim" style={{ width: 52, flex: 'none' }}>{hhmm(t.at).slice(0, 5)}</span>
              <span style={{ color: t.tone === 'human' ? 'var(--human)' : t.tone === 'block' ? 'var(--block)' : t.tone === 'allow' ? 'var(--allow)' : undefined }}>{t.text}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-title">
          <span>
            <b>Oversight health</b> · governing the humans
          </span>
          <span className="mono">median {view.kpi.medianApprovalS ?? '—'}s</span>
        </div>
        {view.oversight.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>No rubber-stamping detected. Approvals under 4 s without opening evidence get flagged.</div>
        ) : (
          view.oversight.slice(0, 3).map((o, i) => (
            <div key={i} style={{ fontSize: 12.5, color: 'var(--warn)', marginBottom: 4 }}>
              ⚑ {o.note}
            </div>
          ))
        )}
      </div>
      <div className="panel">
        <div className="panel-title">
          <span>
            <b>Shadow agents</b> · unregistered callers
          </span>
          <span className="mono">{view.unregistered.length}</span>
        </div>
        {view.unregistered.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>None detected. Unregistered agents are refused fail-closed.</div>
        ) : (
          view.unregistered.map((u) => (
            <div key={u.id} className="row between" style={{ fontSize: 12.5 }}>
              <span style={{ color: 'var(--block)' }}>◌ {u.id}</span>
              <span className="muted">
                {u.attempts}× {u.lastAction.replace(/_/g, ' ')} · {ago(u.at, view.now)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Heatmap() {
  const { view } = useWorld();
  if (!view) return null;
  const colors = ['var(--line-2)', 'rgba(92,201,139,0.35)', 'rgba(229,168,75,0.5)', 'rgba(255,107,107,0.6)'];
  return (
    <div className="panel">
      <div className="panel-title">
        <span>
          <b>Risk heatmap</b> · agent × action, 30 days
        </span>
      </div>
      <div className="heat">
        <div className="heat-row dim">
          <span />
          {view.heat.classes.map((c) => (
            <span key={c} style={{ textAlign: 'center' }}>
              {c}
            </span>
          ))}
        </div>
        {view.heat.rows.map((r) => (
          <div className="heat-row" key={r.agent}>
            <span>{r.agent}</span>
            {r.cells.map((c) => (
              <span key={c.c} className="heat-cell" style={{ background: colors[c.level] }} title={`${c.n} actions`} />
            ))}
          </div>
        ))}
      </div>
      <div className="row muted" style={{ gap: 12, fontSize: 11, marginTop: 8 }}>
        <span>■ <span style={{ color: 'rgba(111,224,180,0.8)' }}>allowed</span></span>
        <span>■ <span style={{ color: 'var(--human)' }}>held</span></span>
        <span>■ <span style={{ color: 'var(--block)' }}>blocked</span></span>
      </div>
    </div>
  );
}

export default function CommandCenter() {
  const { view } = useWorld();
  const k = view?.kpi;
  const tiles: [string, string, string?, string?][] = k
    ? [
        ['Actions today', k.actionsToday.toLocaleString('en-IN'), undefined, 'people + agents'],
        ['Handled by AI', `${k.autoPct}%`, 'var(--allow)', 'inside limits, no human needed'],
        ['Waiting for a person', String(k.waiting), k.waiting ? 'var(--human)' : undefined, 'held at a checkpoint'],
        ['Open incidents', String(k.openIncidents), k.openIncidents ? 'var(--block)' : undefined, 'with a named owner'],
        ['AI cost today', inr(k.aiCost), undefined, 'model spend via gateway'],
        ['Value delivered', inr(k.value), undefined, 'est. handling cost avoided'],
        ['₹ stopped by Abhed', inr(k.damagePrevented), k.damagePrevented ? 'var(--allow)' : undefined, `${k.recordsProtected.toLocaleString('en-IN')} records protected`],
        ['Human minutes', String(k.humanMinutes), undefined, 'what oversight costs'],
      ]
    : [];
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Command <em>Center</em>
          </h1>
          <p className="page-sub">Is NovaBank’s AI workforce safe, and is it worth it? One registry, one rulebook, one ledger for people and agents.</p>
        </div>
        <div className="row muted" style={{ fontSize: 12 }}>
          {view && (
            <>
              store: <span className="mono">{view.store}</span> · v{view.version}
            </>
          )}
        </div>
      </div>
      <div className="kpis">
        {tiles.map(([label, value, color, note]) => (
          <div className="kpi" key={label}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={color ? { color } : undefined}>
              {value}
            </div>
            <div className="kpi-note">{note}</div>
          </div>
        ))}
        {!view && <div className="muted">Loading NovaBank…</div>}
      </div>
      <LiveFloor />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px', marginBottom: 14 }}>
        <AgentTable />
        <div className="stack" style={{ gap: 14 }}>
          <WaitingPanel />
          <PhonesPanel />
        </div>
      </div>
      <WorkBoard />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1.4fr) minmax(0,0.9fr)', marginBottom: 14 }}>
        <div className="stack" style={{ gap: 14 }}>
          <LiveWire />
          <LiveFeed />
        </div>
        <Heatmap />
        <SidePanels />
      </div>
    </main>
  );
}
