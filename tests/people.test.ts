import { describe, expect, it } from 'vitest';
import { assignApproval, escalateApproval, holdApproval, removePerson, upsertPerson } from '../lib/approvals';
import { actionHash, decideApproval, gateway, tick } from '../lib/engine';
import { checkPin, personStats, signToken, verifyToken } from '../lib/people';
import { seedWorld } from '../lib/seed';

const NOW = Date.now();
function held(amount: number) {
  const w = seedWorld(NOW, { sector: 'banking', history: false });
  const r = gateway(w, { actorType: 'agent', actorId: 'rex', action: 'issue_refund', params: { customer: amount > 50000 ? 'C-5012' : 'C-1029', amount } }, { now: NOW });
  return { w, ap: w.approvals.find((a) => a.id === r.approvalId)! };
}
const vote = (w: ReturnType<typeof seedWorld>, id: string, approverId: string) => {
  const ap = w.approvals.find((a) => a.id === id)!;
  return decideApproval(w, id, { decision: 'approve', name: '', approverId, actionHash: actionHash(ap.req), decisionMs: 8000, evidenceViewed: true, device: 'phone' }, NOW + 1000);
};

describe('approver identity and authority', () => {
  it('PINs and signed tokens identify the approver', () => {
    const w = seedWorld(NOW, { sector: 'banking' });
    const meera = w.humans.find((h) => h.id === 'meera')!;
    expect(checkPin(meera, '1234')).toBe(true);
    expect(checkPin(meera, '9999')).toBe(false);
    const t = signToken('banking', 'meera');
    expect(verifyToken(t)).toEqual({ tenant: 'banking', humanId: 'meera' });
    expect(verifyToken(t.slice(0, -2) + 'xx')).toBeNull();
  });

  it('a Level-1 approver cannot approve a Level-2 request; Level-2 can', () => {
    const { w, ap } = held(90000); // > ₹50,000 → L2 two-key
    expect(ap.approverRole).toBe('approver_l2');
    expect(() => vote(w, ap.id, 'arjun')).toThrow(/authority/);
    vote(w, ap.id, 'meera');
    expect(ap.votes[0].approverId).toBe('meera');
  });

  it('hold parks the request without escalating; escalate moves it up; assign routes it', () => {
    const { w, ap } = held(40000);
    holdApproval(w, ap.id, 'arjun', 'calling the customer first', NOW);
    expect(ap.hold?.by).toBe('Arjun Rao');
    expect(tick(w, NOW + 10 * 60_000)).toBe(false); // no auto-escalation while on hold
    escalateApproval(w, ap.id, 'arjun', 'large VIP refund', NOW);
    expect(ap.approverRole).toBe('approver_l2');
    expect(ap.hold).toBeUndefined();
    expect(() => assignApproval(w, ap.id, ['arjun'])).toThrow(/cannot decide/);
    assignApproval(w, ap.id, ['meera']);
    expect(ap.assignees).toEqual(['meera']);
    vote(w, ap.id, 'meera');
    expect(ap.status).toBe('EXECUTED');
    expect(personStats(w, w.humans.find((h) => h.id === 'meera')!).approved).toBe(1);
    expect(w.ledger.some((r) => r.action === 'approval_hold')).toBe(true);
    expect(w.ledger.some((r) => r.action === 'escalate')).toBe(true);
  });

  it('admin adds and removes people, but cannot remove an agent owner or the last rule approver', () => {
    const w = seedWorld(NOW, { sector: 'banking' });
    const h = upsertPerson(w, { name: 'Neha Kulkarni', title: 'Branch Manager', roles: ['approver_l1'], pin: '4321' });
    expect(checkPin(h, '4321')).toBe(true);
    const { ap } = { ap: gateway(w, { actorType: 'agent', actorId: 'rex', action: 'issue_refund', params: { customer: 'C-1029', amount: 40000 } }, { now: NOW }) };
    vote(w, ap.approvalId!, h.id);
    expect(() => removePerson(w, 'priya')).toThrow(/owns/);
    removePerson(w, h.id);
    expect(w.humans.some((x) => x.id === h.id)).toBe(false);
    for (const p of w.humans.filter((x) => x.roles.includes('rule_approver')).slice(1)) p.roles = p.roles.filter((r) => r !== 'rule_approver');
    const last = w.humans.find((x) => x.roles.includes('rule_approver'))!;
    expect(() => upsertPerson(w, { id: last.id, name: last.name, title: last.title, roles: ['operator'] })).toThrow(/rule approver/);
  });
});

describe('duplicate requests', () => {
  it('an identical pending action reuses the open request instead of opening a second one', () => {
    const w = seedWorld(NOW, { sector: 'banking', history: false });
    const req = { actorType: 'agent' as const, actorId: 'rex', action: 'issue_refund', params: { customer: 'C-1029', amount: 40000 } };
    const a = gateway(w, req, { now: NOW });
    const b = gateway(w, req, { now: NOW + 1000 });
    expect(b.approvalId).toBe(a.approvalId);
    expect(w.approvals.filter((x) => x.status === 'PENDING').length).toBe(1);
  });
});
