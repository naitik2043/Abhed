'use client';

import { useEffect, useState } from 'react';
import { Chip, hhmm } from '@/components/app';
import { Donut, HBars, PALETTE, SpeedChart } from '@/components/charts';
import type { Insights } from '@/lib/insights';

export default function InsightsPage() {
  const [d, setD] = useState<Insights | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await fetch('/api/insights', { cache: 'no-store' }).catch(() => null);
      if (r?.ok && alive) setD(await r.json());
    };
    load();
    const t = setInterval(load, 2500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (!d) return <main className="page muted">Computing from the ledger…</main>;
  const points = d.series.points.map((p) => ({ t: p.t, auto: p.auto, held: p.held, blocked: p.blocked, p95: p.p95ms ?? 0 }));
  const maxReason = Math.max(1, ...d.reasons.map((r) => r.count));
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Speed, risk, cost <em>and who signed</em>
          </h1>
          <p className="page-sub">
            {d.sector.company} · computed live from the ledger
          </p>
        </div>
        <a className="btn btn-solid" href="/api/audit?by=Judge" download>
          ⤓ Download full audit report (PDF)
        </a>
      </div>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
        <K l="Agent actions decided" v={String(d.mix.total)} n="since reset, measured" />
        <K l="Ran without a person" v={d.mix.autoPct !== null ? `${d.mix.autoPct}%` : '—'} n={`${d.mix.auto} low-impact`} c="var(--allow)" />
        <K l="Checkpoints (high-impact)" v={d.mix.heldPct !== null ? `${d.mix.heldPct}%` : '—'} n={`${d.mix.held} asked a person`} c="var(--human)" />
        <K l="Refused" v={String(d.mix.blocked)} n="policy · grounding · DLP · scope" c="var(--block)" />
        <K l="Gateway latency p50 / p95" v={d.speed.p50ms !== null ? `${d.speed.p50ms} / ${d.speed.p95ms} ms` : '—'} n={`${d.speed.measured} calls timed`} />
        <K l="Human decision (median)" v={d.human.medianWaitS !== null ? `${d.human.medianWaitS} s` : '—'} n={`${d.human.decided} decided · ${d.human.rubberStamps} rubber-stamp flags`} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', marginBottom: 14 }}>
        <div className="panel">
          <div className="panel-title">
            <span>
              <b>Speed vs control</b> · actions over time by outcome, with gateway p95
            </span>
          </div>
          <SpeedChart points={points} />
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            Governance cost on the hot path is the gateway decision ({d.speed.p95ms ?? '—'} ms at p95), not an LLM call. People are asked only when a rule says the action is high-impact; everything else runs immediately.
          </p>
        </div>
        <div className="panel">
          <div className="panel-title">
            <span>
              <b>Why people were asked</b>
            </span>
          </div>
          {!d.reasons.length && <div className="muted">No checkpoints yet.</div>}
          {d.reasons.map((r) => (
            <div key={r.rule} style={{ marginBottom: 10 }}>
              <div className="row between" style={{ fontSize: 12.5 }}>
                <span className="mono" style={{ color: 'var(--ledger)' }}>
                  {r.rule}
                </span>
                <b>{r.count}</b>
              </div>
              <div className="bar" style={{ margin: '4px 0' }}>
                <span style={{ width: `${(r.count / maxReason) * 100}%`, background: 'var(--human)' }} />
              </div>
              <div className="muted" style={{ fontSize: 11.5 }}>
                {r.says}
              </div>
            </div>
          ))}
          {d.blockReasons.length > 0 && (
            <>
              <div className="panel-title" style={{ marginTop: 12 }}>
                <span>
                  <b>Why actions were refused</b>
                </span>
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {d.blockReasons.map((b) => (
                  <span key={b.category} className="chip chip-block">
                    {b.category} · {b.count}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginBottom: 14 }}>
        <div className="panel">
          <div className="panel-title">
            <span>
              <b>Outcome mix</b>
            </span>
          </div>
          <Donut label="actions" slices={[{ label: 'on its own', value: d.mix.auto, color: 'var(--allow)' }, { label: 'asked a person', value: d.mix.held, color: 'var(--human)' }, { label: 'refused', value: d.mix.blocked, color: 'var(--block)' }]} />
        </div>
        <div className="panel">
          <div className="panel-title">
            <span>
              <b>Refusals by layer</b>
            </span>
          </div>
          <Donut label="refused" slices={d.blockReasons.map((b, i) => ({ label: b.category, value: b.count, color: PALETTE[i % PALETTE.length] }))} />
        </div>
        <div className="panel">
          <div className="panel-title">
            <span>
              <b>LLM cost</b> by agent (₹)
            </span>
          </div>
          <HBars items={d.agents.filter((a) => a.costInr > 0).map((a) => ({ label: a.name, value: Math.round(a.costInr * 100) / 100 }))} color="var(--ledger)" />
        </div>
        <div className="panel">
          <div className="panel-title">
            <span>
              <b>Risk score</b> by agent
            </span>
          </div>
          <HBars items={d.agents.map((a) => ({ label: a.name, value: a.riskScore, color: a.riskScore >= 60 ? 'var(--block)' : a.riskScore >= 30 ? 'var(--warn)' : 'var(--allow)' }))} />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14, overflowX: 'auto' }}>
        <div className="panel-title">
          <span>
            <b>Risk · cost · usage · value</b> per agent
          </span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Owner</th>
              <th>Status</th>
              <th className="r">Actions</th>
              <th className="r">Auto</th>
              <th className="r">Asked</th>
              <th className="r">Refused</th>
              <th className="r">Critical</th>
              <th className="r">LLM calls</th>
              <th className="r">Tokens</th>
              <th className="r">Cost ₹</th>
              <th className="r">Value ₹</th>
              <th>Risk</th>
              <th>Trust score</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {d.agents.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td className="muted">{a.owner}</td>
                <td>
                  <Chip d={a.status} />
                </td>
                <td className="r">{a.actions}</td>
                <td className="r">{a.auto}</td>
                <td className="r">{a.held}</td>
                <td className="r">{a.blocked}</td>
                <td className="r" style={{ color: a.critical ? 'var(--block)' : undefined }}>
                  {a.critical}
                </td>
                <td className="r">{a.llmCalls}</td>
                <td className="r">{a.tokens.toLocaleString('en-IN')}</td>
                <td className="r">{a.costInr.toFixed(2)}</td>
                <td className="r">{a.valueInr.toLocaleString('en-IN')}</td>
                <td style={{ minWidth: 110 }}>
                  <div className="bar">
                    <span style={{ width: `${a.riskScore}%`, background: a.riskScore >= 60 ? 'var(--block)' : a.riskScore >= 30 ? 'var(--warn)' : 'var(--allow)' }} />
                  </div>
                </td>
                <td title={a.trust.recommendation}>
                  <b style={{ color: a.trust.band === 'Trusted' ? 'var(--allow)' : a.trust.band === 'Standard' ? 'var(--info)' : a.trust.band === 'Watch' ? 'var(--warn)' : 'var(--block)' }}>{a.trust.score}</b> <span className="muted">{a.trust.band}</span>
                </td>
                <td>
                  <a className="muted" href={`/api/audit?agent=${a.id}&by=Judge`} download>
                    report ⤓
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>
          Cost = metered LLM tokens through the Abhed gateway + per-action compute. Value = the work each executed action replaces (a fixed per-action estimate) minus anything later disputed. Risk = critical breaches ×40 + refusals ×8 + risk tier.
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <span>
            <b>Accountability chain</b> · every high-impact action that ran, and who signed it
          </span>
        </div>
        {!d.chains.length && <div className="muted">Nothing high-impact has been approved yet. Ask an agent on a company site for something big.</div>}
        {d.chains.map((c) => (
          <div key={c.approvalId} style={{ marginBottom: 14 }}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <b style={{ fontWeight: 500 }}>{c.summary}</b>
              <span className="mono muted">{c.approvalId}</span>
            </div>
            <div className="chain">
              <Node role="Agent" t={c.agent} s={`owner ${c.owner ?? '—'}`} />
              <Node role="Rule" t={c.rule} s="deterministic" tone="warn" />
              <Node role="Approved by" t={c.approvers.map((a) => a.name).join(' + ')} s={c.approvers.map((a) => `${a.device}, ${a.seconds}s${a.evidence ? '' : ', no evidence opened'}`).join(' · ')} tone="human" />
              <Node role="Executed" t={`ledger #${c.executedSeq}`} s={c.recordHash ? `${c.recordHash.slice(0, 12)}…` : ''} tone="allow" />
              <Node role="Sealed" t={c.block ? `block ${c.block.height}` : 'pending'} s={c.block ? `${c.block.hash.slice(0, 12)}…` : 'next block'} />
              <Node role="Anchored" t={c.block?.anchor ? 'Bitcoin (OTS)' : '—'} s={c.block?.anchor ?? 'after sealing'} />
            </div>
            <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
              {c.approvers.map((a) => hhmm(a.at)).join(' · ')}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function K({ l, v, n, c }: { l: string; v: string; n: string; c?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{l}</div>
      <div className="kpi-value" style={{ color: c, fontSize: v.length > 9 ? 20 : undefined }}>
        {v}
      </div>
      <div className="kpi-note">{n}</div>
    </div>
  );
}

function Node({ role, t, s, tone }: { role: string; t: string; s: string; tone?: string }) {
  return (
    <div className={`node ${tone ? `tone-${tone}` : ''}`}>
      <div className="role">{role}</div>
      <div className="t" style={{ fontSize: 13.5 }}>
        {t}
      </div>
      <div className="s">{s}</div>
    </div>
  );
}
