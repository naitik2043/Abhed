'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Qr, hhmm, inr, useWorld } from '@/components/app';

const CAUSES = ['Policy gap', 'Approval error', 'Human override error', 'Attack / manipulation', 'Unsafe request followed', 'Tool failure', 'Data issue'];

export default function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { view, run, busy } = useWorld();
  const [origin, setOrigin] = useState('');
  const [cause, setCause] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  if (!view) return <main className="page muted">Loading…</main>;
  const inc = view.incidents.find((i) => i.id === id);
  if (!inc) return <main className="page muted">Incident {id} not found. It may have been reset.</main>;
  const owner = view.humans.find((h) => h.id === inc.ownerId);
  const ruleAp = inc.ruleApprovalId ? view.approvals.find((a) => a.id === inc.ruleApprovalId) : undefined;
  const newRule = view.rules.find((r) => r.id === 'BENEFICIARY-CHANGE' && r.active);
  const chosen = cause ?? inc.suggestedCause;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className="mono muted">{inc.id}</span>
            <span className={`chip chip-${inc.type === 'INCORRECT_OUTPUT' ? 'warn' : 'block'}`}>{inc.type.replace('_', ' ')}</span>
            <span className="chip chip-muted">severity {inc.severity}</span>
            <span className={`chip chip-${inc.status === 'RESOLVED' ? 'allow' : 'human'}`}>{inc.status.replace(/_/g, ' ')}</span>
          </div>
          <h1 className="page-title" style={{ fontSize: 34 }}>
            {inc.title.split(':')[0]}: <em>{inc.title.split(':').slice(1).join(':').trim() || 'accountability chain'}</em>
          </h1>
          <p className="page-sub">
            Owner: <b style={{ color: 'var(--ink)' }}>{owner?.name}</b> ({owner?.title}). Source record <span className="mono">#{inc.sourceSeq}</span>.
          </p>
        </div>
        <div className="row">
          <Link className="btn btn-ghost" href={`/report/${inc.id}`} target="_blank">
            Export audit report
          </Link>
          <Link className="btn btn-ghost" href="/ledger?verify=1">
            Verify ledger
          </Link>
        </div>
      </div>

      {inc.chain.length > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-title">
            <span>
              <b>Accountability chain</b> · who did it, who owns it, which rule allowed it
            </span>
          </div>
          <div className="chain">
            {inc.chain.map((n, i) => (
              <div key={i} className={`node tone-${n.tone}`} style={{ animationDelay: `${0.15 + i * 0.4}s` }}>
                <div className="role">{n.role}</div>
                <div className="t">{n.title}</div>
                <div className="s">{n.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', marginBottom: 14 }}>
        <div className="panel">
          <div className="panel-title">
            <span>
              <b>Timeline</b>
            </span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {inc.timeline.map((t, i) => (
              <div key={i} className="row" style={{ alignItems: 'flex-start', fontSize: 12.5 }}>
                <span className="mono dim" style={{ width: 60, flex: 'none' }}>{hhmm(t.ts).slice(0, 5)}</span>
                <span style={{ color: t.tone === 'block' ? 'var(--block)' : t.tone === 'allow' ? 'var(--allow)' : t.tone === 'human' ? 'var(--human)' : t.tone === 'warn' ? 'var(--warn)' : undefined }}>{t.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <span>
              <b>Root cause</b> · suggested by transparent rules
            </span>
          </div>
          <div style={{ fontSize: 22, letterSpacing: '-0.03em' }}>
            {inc.confirmedCause ?? inc.suggestedCause}
            {inc.confirmedCause && <span className="serif muted"> · confirmed by {inc.confirmedBy}</span>}
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Why:</b> {inc.causeWhy}
          </div>
          {!inc.confirmedCause && inc.type === 'INCORRECT_OUTPUT' && (
            <>
              <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
                {CAUSES.map((c) => (
                  <button key={c} className={`pill ${chosen === c ? 'active' : ''}`} style={{ height: 28, fontSize: 12 }} onClick={() => setCause(c)}>
                    {c}
                  </button>
                ))}
              </div>
              <button className="btn btn-solid" style={{ marginTop: 12 }} disabled={!!busy} onClick={() => run('confirm_cause', { incidentId: inc.id, cause: chosen, by: 'meera' })}>
                Confirm as Meera (Head of Risk)
              </button>
              <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>A person confirms or changes it. That choice is ledgered.</div>
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">
            <span>
              <b>Corrective action</b>
            </span>
            {inc.corrective && <span>owner {view.humans.find((h) => h.id === inc.corrective!.owner)?.name.split(' ')[0]} · due {inc.corrective.due}</span>}
          </div>
          {inc.corrective ? (
            <>
              <div className="mono" style={{ color: 'var(--ledger)' }}>
                new rule {inc.corrective.ruleId}
              </div>
              <div style={{ fontSize: 15, marginTop: 4 }}>“{inc.corrective.says}”</div>
              <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" disabled={!!busy || !inc.confirmedCause} onClick={() => run('replay', { incidentId: inc.id })} title={!inc.confirmedCause ? 'Confirm the root cause first' : ''}>
                  Replay last 30 days ▸
                </button>
                <button
                  className="btn btn-solid btn-sm"
                  disabled={!!busy || !inc.replay || Boolean(newRule) || (ruleAp?.status === 'PENDING')}
                  onClick={() => run('propose_rule', { incidentId: inc.id, by: 'arjun' })}
                >
                  Activate rule (as Arjun)
                </button>
              </div>
              {inc.replay && (
                <div className="panel" style={{ marginTop: 12, borderColor: 'color-mix(in srgb, var(--allow) 50%, transparent)' }}>
                  <div className="badge-k" style={{ color: 'var(--allow)' }}>Replay · same engine as live</div>
                  <div style={{ marginTop: 6, fontSize: 14 }}>
                    Applied to the last {inc.replay.days} days ({inc.replay.scanned} refunds), {inc.replay.ruleId} would have held <b>{inc.replay.held}</b>:{' '}
                    <b style={{ color: 'var(--allow)' }}>{inc.replay.caught} later disputed (caught)</b> and {inc.replay.confirmedFine} confirmed fine. Cost: {inc.replay.confirmedFine} extra approvals in a month. Legitimate refunds blocked: {inc.replay.blockedLegit}.
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="muted">Agent auto-paused; its work went to people. Owner reviews before resuming.</div>
          )}
        </div>
      </div>

      {ruleAp && ruleAp.status === 'PENDING' && (
        <div className="panel waiting" style={{ marginBottom: 14 }}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 22 }}>
            <div style={{ width: 190, flex: 'none' }}>
              <Qr url={`${origin}/approve/${ruleAp.id}`} />
            </div>
            <div>
              <div className="badge-k" style={{ color: 'var(--human)' }}>
                Waiting for a second person · {ruleAp.id}
              </div>
              <div style={{ fontSize: 26, letterSpacing: '-0.035em', marginTop: 6, lineHeight: 1.15 }}>
                Even the rules can’t change <span className="serif muted">without a second person.</span>
              </div>
              <div className="muted" style={{ marginTop: 8, maxWidth: 620 }}>
                Arjun wrote it, so Arjun can’t approve it. Agents can never change rules. Scan to approve as the rule approver: the rule goes live with your name on it.
              </div>
            </div>
          </div>
        </div>
      )}
      {newRule && (
        <div className="panel" style={{ marginBottom: 14, borderColor: 'color-mix(in srgb, var(--allow) 55%, transparent)' }}>
          <div className="row between wrap">
            <div style={{ fontSize: 20, letterSpacing: '-0.03em' }}>
              <span className="mono" style={{ color: 'var(--allow)' }}>
                {newRule.id} v{newRule.version}
              </span>{' '}
              is live · <span className="serif muted">approved by {newRule.approvedBy}</span>
            </div>
            <Link className="btn btn-solid" href={`/report/${inc.id}`} target="_blank">
              Open audit report
            </Link>
          </div>
        </div>
      )}
      {inc.type === 'INCORRECT_OUTPUT' && (
        <div className="muted" style={{ fontSize: 12.5 }}>
          Accountable ≠ responsible. Rex executed it (responsible). Priya owns Rex’s delegation and Arjun + Meera own the rule that allowed it (accountable). Amount at stake: {inc.amount ? inr(inc.amount) : '—'}.
        </div>
      )}
    </main>
  );
}
