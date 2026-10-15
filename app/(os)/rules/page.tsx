'use client';

import { useWorld } from '@/components/app';
import { RuleBuilder } from '@/components/rule-builder';

const MATRIX: { role: string; who: string; cells: Record<string, string> }[] = [
  { role: 'Agent (Rex / Aria)', who: 'AI', cells: { refund: '≤ delegation', bulk_export: 'never', email_out: 'limit', rule_change: 'never', approve: 'never', pause: 'never' } },
  { role: 'Operator', who: 'Isha', cells: { refund: 'needs approval', bulk_export: 'never', email_out: 'allowed', rule_change: 'never', approve: 'never', pause: 'never' } },
  { role: 'Agent owner', who: 'Priya, Karan, Dev', cells: { refund: 'delegates', bulk_export: 'never', email_out: 'allowed', rule_change: 'propose', approve: 'not own agent', pause: 'own agents' } },
  { role: 'Approver L1', who: 'Arjun, Guest Judge', cells: { refund: '≤ ₹50,000', bulk_export: 'never', email_out: 'allowed', rule_change: 'never', approve: 'L1 holds', pause: 'any agent' } },
  { role: 'Approver L2', who: 'Meera, Guest Judge', cells: { refund: '> ₹50,000 (two-key)', bulk_export: 'needs approval', email_out: 'allowed', rule_change: 'never', approve: 'L1 + L2', pause: 'any agent' } },
  { role: 'Rule author', who: 'Arjun', cells: { refund: '—', bulk_export: '—', email_out: '—', rule_change: 'propose only', approve: 'not own rule', pause: '—' } },
  { role: 'Rule approver', who: 'Meera, Guest Judge', cells: { refund: '—', bulk_export: '—', email_out: '—', rule_change: 'second person', approve: 'rule changes', pause: '—' } },
];
const COLS = ['refund', 'bulk_export', 'email_out', 'rule_change', 'approve', 'pause'];
const tone = (v: string) => (v === 'never' ? 'var(--block)' : v.includes('approval') || v.includes('two-key') || v.includes('second') || v.includes('propose') ? 'var(--human)' : v === '—' ? 'var(--muted-2)' : 'var(--allow)');

export default function RulesPage() {
  const { view } = useWorld();
  if (!view) return <main className="page muted">Loading…</main>;
  const active = new Set(view.activeRuleIds);
  const latest = [...view.rules].sort((a, b) => a.id.localeCompare(b.id) || b.version - a.version);
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            The <em>Rulebook</em>
          </h1>
          <p className="page-sub">Plain English first, versioned, and every edit is itself a governed action that needs a second person. Block wins. Unknown high-impact actions go to a person.</p>
        </div>
      </div>
      <RuleBuilder />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', marginBottom: 14 }}>
        {latest.map((r) => {
          const on = active.has(`${r.id}@${r.version}`);
          return (
            <div key={`${r.id}@${r.version}`} className="panel" style={{ opacity: on ? 1 : 0.45 }}>
              <div className="row between">
                <span className="mono" style={{ color: 'var(--ledger)' }}>
                  {r.id} v{r.version}
                </span>
                <span className={`chip chip-${r.decision === 'BLOCKED' ? 'block' : r.decision === 'NEEDS_APPROVAL' ? 'human' : 'allow'}`}>
                  {r.decision === 'NEEDS_APPROVAL' ? 'needs a person' : r.decision.toLowerCase()}
                </span>
              </div>
              <div style={{ fontSize: 15.5, marginTop: 8, letterSpacing: '-0.015em' }}>“{r.says}”</div>
              <div className="mono dim" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                when {whenText(r.when)}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                {on ? 'active' : 'superseded'} · author {view.humans.find((h) => h.id === r.author)?.name ?? r.author} · approved by{' '}
                {view.humans.find((h) => h.id === r.approvedBy)?.name ?? r.approvedBy}
                {r.twoKey ? ` · two-key` : ''}
                {r.severity === 'critical' ? ' · critical → auto-pause' : ''}
              </div>
            </div>
          );
        })}
      </div>
      {view.sector === 'banking' && (
      <div className="panel" style={{ overflowX: 'auto' }}>
        <div className="panel-title">
          <span>
            <b>Roles &amp; permissions</b> · the same matrix for humans and agents, enforced in the gateway
          </span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Who</th>
              {COLS.map((c) => (
                <th key={c}>{c.replace('_', ' ')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((m) => (
              <tr key={m.role}>
                <td style={{ fontWeight: 500 }}>{m.role}</td>
                <td className="muted">{m.who}</td>
                {COLS.map((c) => (
                  <td key={c} style={{ color: tone(m.cells[c]), fontSize: 12.5 }}>
                    {m.cells[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </main>
  );
}

/** A rule's condition, readable: `action = issue_refund · amount > ₹10,000 · amount ≤ ₹50,000`. */
function whenText(when: object) {
  const OPS: Record<string, string> = { _gt: '>', _gte: '≥', _lt: '<', _lte: '≤' };
  const money = (k: string) => /amount|value|price|total/.test(k);
  return Object.entries(when as Record<string, unknown>)
    .map(([k, v]) => {
      const op = Object.keys(OPS).find((o) => k.endsWith(o));
      const key = (op ? k.slice(0, -op.length) : k).replace(/_/g, ' ');
      const val = typeof v === 'number' ? (money(k) ? `₹${v.toLocaleString('en-IN')}` : v.toLocaleString('en-IN')) : Array.isArray(v) ? v.join(' or ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `${key} ${op ? OPS[op] : '='} ${val}`;
    })
    .join(' · ');
}
