'use client';

import { useEffect, useState } from 'react';
import { Qr } from './app';

interface Meta {
  company: string;
  actions: { name: string; label: string; risk: string }[];
  flags: string[];
  people: { id: string; name: string; roles: string[] }[];
}

/** A company writes its own rule in plain words + conditions. Replay first, then a second person approves. */
export function RuleBuilder() {
  const [m, setM] = useState<Meta | null>(null);
  const [f, setF] = useState({ id: '', says: '', action: '', amount_gt: '', amount_lte: '', records_gt: '', percent_gt: '', external: '', flag: '', decision: 'NEEDS_APPROVAL', approverRole: 'approver_l1', twoKey: '1', by: '' });
  const [replay, setReplay] = useState<{ scanned: number; matched: number; disputed: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: string; text: string; approvalId?: string } | null>(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
    fetch('/api/rules')
      .then((r) => r.json())
      .then((j: Meta) => {
        setM(j);
        setF((x) => ({ ...x, action: j.actions[0]?.name ?? '', by: j.people.find((p) => p.roles.includes('rule_author') || p.roles.includes('agent_owner'))?.id ?? j.people[0]?.id ?? '' }));
      });
  }, []);
  if (!m) return null;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const rule = () => ({
    id: f.id || `${f.action}-custom`.toUpperCase().replace(/_/g, '-'),
    says: f.says,
    decision: f.decision,
    approverRole: f.approverRole,
    twoKey: Number(f.twoKey),
    when: { action: f.action, amount_gt: f.amount_gt, amount_lte: f.amount_lte, records_gt: f.records_gt, percent_gt: f.percent_gt, external: f.external, flag: f.flag },
  });
  const post = async (dryRun: boolean) => {
    setMsg(null);
    const r = await fetch('/api/rules', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ by: f.by, rule: rule(), dryRun }) });
    const j = await r.json();
    if (!r.ok) return setMsg({ tone: 'block', text: j.error });
    if (dryRun) setReplay(j.result.replay);
    else {
      setReplay(j.result.replay);
      setMsg({ tone: 'human', text: `Proposed. ${j.result.reason} It goes live only after a second person approves.`, approvalId: j.result.approvalId });
    }
  };
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-title">
        <span>
          <b>Add a {m.company.replace(' (fictional)', '')} rule</b> · deterministic, replayed on history, two-person activation
        </span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 16 }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
          <label className="field" style={{ gridColumn: 'span 4' }}>
            In plain words
            <input value={f.says} onChange={set('says')} placeholder="e.g. Cancelling an order above ₹20,000 needs the support lead." />
          </label>
          <label className="field" style={{ gridColumn: 'span 2' }}>
            When the agent does
            <select value={f.action} onChange={set('action')}>
              {m.actions.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.label} ({a.name})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Amount above ₹
            <input value={f.amount_gt} onChange={set('amount_gt')} inputMode="numeric" />
          </label>
          <label className="field">
            Amount at most ₹
            <input value={f.amount_lte} onChange={set('amount_lte')} inputMode="numeric" />
          </label>
          <label className="field">
            Records above
            <input value={f.records_gt} onChange={set('records_gt')} inputMode="numeric" />
          </label>
          <label className="field">
            Change above %
            <input value={f.percent_gt} onChange={set('percent_gt')} inputMode="numeric" />
          </label>
          <label className="field">
            Leaves the company
            <select value={f.external} onChange={set('external')}>
              <option value="">any</option>
              <option value="true">yes</option>
              <option value="false">no</option>
            </select>
          </label>
          <label className="field">
            Risk flag
            <select value={f.flag} onChange={set('flag')}>
              <option value="">none</option>
              {m.flags.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Then
            <select value={f.decision} onChange={set('decision')}>
              <option value="NEEDS_APPROVAL">ask a person</option>
              <option value="BLOCKED">block</option>
              <option value="ALLOWED">allow</option>
            </select>
          </label>
          <label className="field">
            Who decides
            <select value={f.approverRole} onChange={set('approverRole')}>
              <option value="approver_l1">Level 1</option>
              <option value="approver_l2">Level 2</option>
              <option value="executive">Executive</option>
            </select>
          </label>
          <label className="field">
            People needed
            <select value={f.twoKey} onChange={set('twoKey')}>
              <option value="1">one</option>
              <option value="2">two (two-key)</option>
            </select>
          </label>
          <label className="field">
            Proposed by
            <select value={f.by} onChange={set('by')}>
              {m.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ gridColumn: 'span 2' }}>
            Rule id (optional)
            <input value={f.id} onChange={set('id')} placeholder="CANCEL-BIG" />
          </label>
          <div className="row" style={{ gap: 8, gridColumn: 'span 2', alignItems: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => post(true)}>
              Replay on 30 days
            </button>
            <button className="btn btn-solid btn-sm" onClick={() => post(false)} disabled={f.says.length < 8}>
              Propose rule
            </button>
          </div>
        </div>
        <div>
          {replay && (
            <div className="panel" style={{ padding: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 13 }}>
                Replay: this rule would have matched <b>{replay.matched}</b> of <b>{replay.scanned}</b> real {f.action.replace(/_/g, ' ')} actions in the last 30 days{replay.disputed ? `, ${replay.disputed} of them later disputed` : ''}.
              </div>
              <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>
                Same matcher as the live gateway, so the replay is what production would have done.
              </div>
            </div>
          )}
          {msg && (
            <div className={`panel ${msg.tone === 'human' ? 'waiting' : ''}`} style={{ padding: 12, color: msg.tone === 'block' ? 'var(--block)' : undefined }}>
              <div style={{ fontSize: 13 }}>{msg.text}</div>
              {msg.approvalId && origin && (
                <div className="row" style={{ gap: 12, marginTop: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 110 }}>
                    <Qr url={`${origin}/approve/${msg.approvalId}`} />
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {msg.approvalId}: a rule approver (not the author) scans to activate it. Agents can never approve or change rules.
                  </div>
                </div>
              )}
            </div>
          )}
          {!replay && !msg && (
            <div className="muted" style={{ fontSize: 12.5 }}>
              Conflicts resolve deterministically: any matching BLOCK wins, then the strictest hold, then ALLOW. A high-impact action with no matching rule always goes to a person.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
