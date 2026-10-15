import { activeRules, effectiveOutcomes, nameOf, verifyLedger } from './engine';
import type { Agent, LedgerRecord, World } from './types';

const DAY = 86_400_000;

export interface AgentRow extends Agent {
  ownerName: string;
  tasks: number;
  autoPct: number;
  waiting: number;
  incidents: number;
  cost: number;
  value: number;
  blocked: number;
  openTickets: number;
}

export function buildView(w: World, now = Date.now()) {
  const today = w.ledger.filter((r) => now - r.ts < DAY);
  const outcomes = effectiveOutcomes(w);
  const work = today.filter((r) => r.action !== 'llm_call' && (r.actorType === 'agent' || (r.actorType === 'human' && !['approve', 'reject', 'outcome', 'approval_hold', 'approval_release', 'approval_assign', 'escalate', 'roster_change', 'audit_export', 'data_import'].includes(r.action))));
  const agentActs = today.filter((r) => r.actorType === 'agent' && r.action !== 'llm_call');
  const auto = agentActs.filter((r) => r.decision === 'ALLOWED');
  const pending = w.approvals.filter((a) => a.status === 'PENDING');
  const openIncidents = w.incidents.filter((i) => i.status !== 'RESOLVED');
  const cost = today.reduce((s, r) => s + (r.cost ?? 0), 0);
  const value = today
    .filter((r) => (r.decision === 'ALLOWED' || r.decision === 'EXECUTED') && outcomes.get(r.seq) !== 'disputed')
    .reduce((s, r) => s + Number(r.meta?.value ?? 0), 0);
  const blockedRows = today.filter((r) => r.decision === 'BLOCKED' || r.decision === 'VOID');
  const damagePrevented = blockedRows.reduce((s, r) => s + (Number(r.meta?.amount ?? r.params.amount ?? 0) || 0), 0);
  const recordsProtected = blockedRows.reduce((s, r) => s + (Number(r.meta?.records ?? r.params.records ?? 0) || 0), 0);
  const votes = w.approvals.flatMap((a) => a.votes);
  const approvalsToday = w.approvals.filter((a) => now - a.createdAt < DAY);
  const humanMinutes = Math.round(votes.length * 1.5 + w.tickets.filter((t) => t.lane === 'HUMAN' || t.lane === 'ESCALATED').length * 6 + 42);
  const medianApprovalS = (() => {
    const ds = votes.map((v) => v.decisionMs).sort((a, b) => a - b);
    return ds.length ? Math.round(ds[Math.floor(ds.length / 2)] / 100) / 10 : null;
  })();

  const agents: AgentRow[] = w.agents.map((a) => {
    const mine = today.filter((r) => r.actorId === a.id && r.action !== 'llm_call');
    const mineAuto = mine.filter((r) => r.decision === 'ALLOWED');
    const llm = today.filter((r) => r.actorId === a.id && r.action === 'llm_call');
    return {
      ...a,
      ownerName: nameOf(w, a.owner),
      tasks: mine.length,
      autoPct: mine.length ? Math.round((mineAuto.length / mine.length) * 100) : 0,
      waiting: pending.filter((p) => p.req.actorId === a.id).length,
      incidents: openIncidents.filter((i) => w.ledger.find((r) => r.seq === i.sourceSeq)?.actorId === a.id).length,
      cost: Math.round([...mine, ...llm].reduce((s, r) => s + (r.cost ?? 0), 0)),
      value: Math.round(mine.filter((r) => r.decision === 'ALLOWED' || r.decision === 'EXECUTED').reduce((s, r) => s + Number(r.meta?.value ?? 0), 0)),
      blocked: mine.filter((r) => r.decision === 'BLOCKED').length,
      openTickets: w.tickets.filter((t) => t.assignee === a.id && t.lane !== 'DONE').length,
    };
  });

  // risk heatmap: agent × action class from the ledger (last 30 days)
  const classes = ['refund', 'data', 'email', 'ops', 'rules'];
  const classOf = (a: string) =>
    a.includes('refund') ? 'refund' : a.includes('export') || a.includes('customer') || a.includes('delete') ? 'data' : a.includes('email') ? 'email' : a.includes('rule') || a === 'approve' ? 'rules' : 'ops';
  const heat = w.agents.map((a) => ({
    agent: a.name,
    cells: classes.map((c) => {
      const rows = w.ledger.filter((r) => r.actorId === a.id && classOf(r.action) === c);
      const bad = rows.filter((r) => r.decision === 'BLOCKED' || r.decision === 'VOID').length;
      const held = rows.filter((r) => r.decision === 'NEEDS_APPROVAL').length;
      return { c, n: rows.length, level: bad ? 3 : held ? 2 : rows.length ? 1 : 0 };
    }),
  }));

  // checklist ticks: computed from what actually happened
  const has = (f: (r: LedgerRecord) => boolean) => w.ledger.some(f);
  const checklist = [
    { id: 'R1', label: 'Agent registry', done: true },
    { id: 'R2', label: 'Rules + approvals', done: has((r) => r.decision === 'NEEDS_APPROVAL' && now - r.ts < DAY) },
    { id: 'R3', label: 'Unified trail', done: has((r) => r.action === 'approve' && now - r.ts < DAY) },
    { id: 'R4', label: 'Allocation + escalation', done: w.tickets.some((t) => t.why.startsWith('Re-routed')) },
    { id: 'R5', label: 'Dashboard + pause', done: w.agents.some((a) => a.status !== 'ACTIVE') },
    { id: 'R6', label: 'Audit + accountability chain', done: w.incidents.some((i) => i.type === 'INCORRECT_OUTPUT') },
    { id: 'D1', label: 'Expected demo', done: has((r) => r.action === 'approve') && has((r) => r.action === 'pause_agent') },
  ];

  const verify = verifyLedger(w);

  return {
    version: w.version,
    now,
    company: w.company,
    sector: w.sector ?? 'banking',
    blocks: (w.blocks ?? []).length,
    runsActive: (w.runs ?? []).filter((r) => r.status === 'running' || r.status === 'waiting').length,
    kpi: {
      actionsToday: work.length,
      autoPct: agentActs.length ? Math.round((auto.length / agentActs.length) * 1000) / 10 : 0,
      waiting: pending.length,
      openIncidents: openIncidents.length,
      aiCost: Math.round(cost),
      value: Math.round(value),
      humanMinutes,
      damagePrevented,
      recordsProtected,
      medianApprovalS,
      approvalsToday: approvalsToday.length,
    },
    agents,
    humans: w.humans,
    approvals: [...w.approvals].reverse().slice(0, 30),
    ledger: [...w.ledger].reverse().slice(0, 120),
    ledgerTotal: w.ledger.length,
    tickets: w.tickets,
    incidents: w.incidents,
    rules: w.rules,
    activeRuleIds: activeRules(w).map((r) => `${r.id}@${r.version}`),
    twin: w.twin,
    oversight: w.oversight,
    unregistered: w.unregistered,
    agentTrace: w.agentTrace.slice(0, 14),
    heat: { classes, rows: heat },
    checklist,
    verify,
    tampered: Boolean(w.tamper),
    sharmaSeq: w.ledger.find((r) => r.ticketId === '#7741' && r.action === 'issue_refund')?.seq ?? null,
    outcomes: Object.fromEntries([...outcomes.entries()].filter(([seq]) => seq > w.ledger.length - 400)),
  };
}

export type View = ReturnType<typeof buildView>;
