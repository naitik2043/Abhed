import { describe, expect, it } from 'vitest';
import {
  actionHash,
  confirmCause,
  decideApproval,
  disputeRecord,
  gateway,
  GovError,
  pauseAgent,
  proposeRule,
  restore,
  resumeAgent,
  reuseApproval,
  runReplay,
  tamper,
  tick,
  verifyLedger,
  ESCALATE_AFTER_MS,
} from '@/lib/engine';
import { ruleBasedPlan } from '@/lib/planner';
import { applyRexRun, applyRogue, applyRunaway, applyTwinRun, POISONED_TICKET, REX_TICKET } from '@/lib/scenarios';
import { seedWorld } from '@/lib/seed';
import { buildView } from '@/lib/view';

const fresh = () => seedWorld(1_760_000_000_000);
const NOW = 1_760_000_100_000;

function rexHeld() {
  const w = fresh();
  const plan = ruleBasedPlan(REX_TICKET, { customerId: 'C-1029' });
  const res = applyRexRun(w, plan, NOW);
  return { w, approvalId: res.approvalId! };
}

describe('seed + ledger', () => {
  it('seeds a valid hash chain with history', () => {
    const w = fresh();
    expect(w.ledger.length).toBeGreaterThan(250);
    expect(verifyLedger(w).valid).toBe(true);
  });
  it('is deterministic', () => {
    expect(fresh().ledger.at(-1)!.hash).toBe(fresh().ledger.at(-1)!.hash);
  });
});

describe('A1–A3 · Moment 1: approval bound to the exact action', () => {
  it('A1 holds a ₹40,000 refund for a person', () => {
    const { w, approvalId } = rexHeld();
    const ap = w.approvals.find((a) => a.id === approvalId)!;
    expect(ap.status).toBe('PENDING');
    expect(ap.req.params.amount).toBe(40000);
    expect(ap.ruleIds).toContain('REFUND-L1@2');
    expect(ap.why).toMatch(/10,000/);
  });
  it('A2 judge approval executes once and names the judge in the ledger', () => {
    const { w, approvalId } = rexHeld();
    const ap = w.approvals.find((a) => a.id === approvalId)!;
    decideApproval(w, approvalId, { decision: 'approve', name: 'Dr. Judge', actionHash: ap.actionHash, decisionMs: 9000, evidenceViewed: true }, NOW + 1);
    expect(ap.status).toBe('EXECUTED');
    const rec = w.ledger.find((r) => r.seq === ap.executedSeq)!;
    expect(rec.approvers).toEqual(['Dr. Judge']);
    expect(rec.ruleRef).toBe('REFUND-L1@2');
    expect(verifyLedger(w).valid).toBe(true);
  });
  it('A3 reuse or ₹1 change is refused and recorded', () => {
    const { w, approvalId } = rexHeld();
    const ap = w.approvals.find((a) => a.id === approvalId)!;
    decideApproval(w, approvalId, { decision: 'approve', name: 'Dr. Judge', actionHash: ap.actionHash, decisionMs: 9000, evidenceViewed: true }, NOW + 1);
    const r1 = reuseApproval(w, approvalId, { ...ap.req.params, amount: 40001 }, NOW + 2);
    expect(r1.reason).toMatch(/different fingerprint/);
    const r2 = reuseApproval(w, approvalId, { ...ap.req.params }, NOW + 3);
    expect(r2.reason).toMatch(/single-use/);
    expect(w.ledger.filter((r) => r.decision === 'VOID').length).toBe(2);
  });
  it('a stale hash from the phone voids the approval', () => {
    const { w, approvalId } = rexHeld();
    expect(() =>
      decideApproval(w, approvalId, { decision: 'approve', name: 'J', actionHash: 'abc', decisionMs: 9000, evidenceViewed: true }, NOW + 1),
    ).toThrow(GovError);
    expect(w.approvals.find((a) => a.id === approvalId)!.status).toBe('VOID');
  });
  it('flags a rubber-stamp approval', () => {
    const { w, approvalId } = rexHeld();
    const ap = w.approvals.find((a) => a.id === approvalId)!;
    decideApproval(w, approvalId, { decision: 'approve', name: 'Speedy', actionHash: ap.actionHash, decisionMs: 1200, evidenceViewed: false }, NOW + 1);
    expect(w.oversight[0].approver).toBe('Speedy');
    expect(w.ledger.some((r) => r.decision === 'FLAG')).toBe(true);
  });
});

describe('A4 · Twin Universe', () => {
  it('computes damage from proposed actions, blocks, auto-pauses and re-routes', () => {
    const w = fresh();
    const plan = ruleBasedPlan(POISONED_TICKET, { customerId: 'C-6120', customerCount: w.customerCount });
    const run = applyTwinRun(w, plan, POISONED_TICKET, NOW);
    expect(run.without.rupees).toBe(485000);
    expect(run.without.records).toBe(1206);
    expect(run.with.rupees).toBe(0);
    expect(run.with.records).toBe(0);
    expect(run.with.paused).toBe(true);
    expect(run.with.rerouted).toBe(14);
    const aria = w.agents.find((a) => a.id === 'aria')!;
    expect(aria.status).toBe('PAUSED');
    expect(w.tickets.filter((t) => t.assignee === 'aria' && t.lane !== 'DONE').length).toBe(0);
    expect(verifyLedger(w).valid).toBe(true);
  });
  it('a paused agent cannot act', () => {
    const w = fresh();
    pauseAgent(w, 'rex', 'priya', 'test', NOW);
    const r = gateway(w, { actorType: 'agent', actorId: 'rex', action: 'issue_refund', params: { amount: 100, customer: 'C-3341', to_account: 'own' } }, { now: NOW + 1 });
    expect(r.decision).toBe('BLOCKED');
    expect(() => resumeAgent(w, 'rex', 'arjun', 'x')).toThrow(/owner/);
    resumeAgent(w, 'rex', 'priya', 'reviewed', NOW + 2);
    expect(w.agents.find((a) => a.id === 'rex')!.status).toBe('ACTIVE');
  });
});

describe('A5–A6 · Mrs. Sharma: chain, replay, governed rule change', () => {
  it('dispute → policy gap → replay 4/1/3 → rule needs a second person', () => {
    const w = fresh();
    const seq = w.ledger.find((r) => r.ticketId === '#7741')!.seq;
    const inc = disputeRecord(w, seq, 'isha', NOW);
    expect(inc.chain).toHaveLength(6);
    expect(inc.suggestedCause).toBe('Policy gap');
    confirmCause(w, inc.id, 'meera', 'Policy gap', NOW + 1);
    runReplay(w, inc.id, NOW + 2);
    expect(inc.replay).toMatchObject({ held: 4, caught: 1, confirmedFine: 3 });
    const { approvalId } = proposeRule(w, inc.id, 'arjun', NOW + 3);
    const ap = w.approvals.find((a) => a.id === approvalId)!;
    expect(ap.approverRole).toBe('rule_approver');
    expect(() =>
      decideApproval(w, approvalId, { decision: 'approve', name: 'Arjun Rao', actionHash: ap.actionHash, decisionMs: 8000, evidenceViewed: true }, NOW + 4),
    ).toThrow(/cannot approve/);
    decideApproval(w, approvalId, { decision: 'approve', name: 'Guest Judge', actionHash: ap.actionHash, decisionMs: 8000, evidenceViewed: true }, NOW + 5);
    expect(w.rules.some((r) => r.id === 'BENEFICIARY-CHANGE' && r.active)).toBe(true);
    expect(inc.status).toBe('RESOLVED');
    // the new rule now holds a refund to a recently changed account
    const r = gateway(w, { actorType: 'agent', actorId: 'rex', action: 'issue_refund', params: { amount: 3000, customer: 'C-2210', to_account: 'own' } }, { now: NOW + 6 });
    expect(r.decision).toBe('NEEDS_APPROVAL');
  });
  it('agents can never change rules', () => {
    const w = fresh();
    const r = gateway(w, { actorType: 'agent', actorId: 'aria', action: 'update_rule', params: { rule: 'REFUND-L1' } }, { now: NOW });
    expect(r.decision).toBe('BLOCKED');
  });
});

describe('A7 · tamper evidence', () => {
  it('verify fails at the exact edited record and passes after restore', () => {
    const w = fresh();
    const t = tamper(w);
    const v = verifyLedger(w);
    expect(v.valid).toBe(false);
    expect(v.firstBadSeq).toBe(t.seq);
    restore(w);
    expect(verifyLedger(w).valid).toBe(true);
  });
});

describe('A8–A11 · two-key, escalation, shadow agents, runaway', () => {
  it('A8 ₹90,000 needs two different Level-2 people, never the owner', () => {
    const w = fresh();
    const r = gateway(w, { actorType: 'agent', actorId: 'rex', action: 'issue_refund', params: { amount: 90000, customer: 'C-5012', to_account: 'own' } }, { now: NOW });
    const ap = w.approvals.find((a) => a.id === r.approvalId)!;
    expect(ap.twoKey).toBe(2);
    const h = ap.actionHash;
    expect(() => decideApproval(w, ap.id, { decision: 'approve', name: 'Priya Menon', actionHash: h, decisionMs: 9000, evidenceViewed: true }, NOW + 1)).toThrow(/cannot approve/);
    decideApproval(w, ap.id, { decision: 'approve', name: 'Meera Iyer', actionHash: h, decisionMs: 9000, evidenceViewed: true }, NOW + 2);
    expect(() => decideApproval(w, ap.id, { decision: 'approve', name: 'Meera Iyer', actionHash: h, decisionMs: 9000, evidenceViewed: true }, NOW + 3)).toThrow(/two different/);
    expect(ap.status).toBe('PENDING');
    decideApproval(w, ap.id, { decision: 'approve', name: 'Guest Judge', actionHash: h, decisionMs: 9000, evidenceViewed: true }, NOW + 4);
    expect(ap.status).toBe('EXECUTED');
  });
  it('A9 unanswered approvals escalate', () => {
    const { w, approvalId } = rexHeld();
    expect(tick(w, NOW + ESCALATE_AFTER_MS + 10)).toBe(true);
    const ap = w.approvals.find((a) => a.id === approvalId)!;
    expect(ap.escalationLevel).toBe(1);
    expect(ap.approverRole).toBe('approver_l2');
  });
  it('A10 unregistered agents are blocked fail-closed', () => {
    const w = fresh();
    const r = applyRogue(w, NOW);
    expect(r.decision).toBe('BLOCKED');
    expect(w.unregistered).toHaveLength(1);
  });
  it('A11 runaway loop trips the circuit breaker', () => {
    const w = fresh();
    applyRunaway(w, NOW);
    expect(w.agents.find((a) => a.id === 'nova')!.status).toBe('PAUSED');
  });
  it('approval hash covers params', () => {
    const a = actionHash({ actorType: 'agent', actorId: 'rex', action: 'issue_refund', params: { amount: 1 } });
    const b = actionHash({ actorType: 'agent', actorId: 'rex', action: 'issue_refund', params: { amount: 2 } });
    expect(a).not.toBe(b);
  });
});

describe('view', () => {
  it('computes KPIs from the ledger', () => {
    const w = fresh();
    const v = buildView(w, 1_760_000_000_000 + 1000);
    expect(v.kpi.actionsToday).toBeGreaterThan(20);
    expect(v.agents).toHaveLength(5);
    expect(v.verify.valid).toBe(true);
  });
});
