import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Approval, Human, Role, World } from './types';
import { sha256 } from './util';

/**
 * People: who may decide what. Approvers sign in on their phone with a PIN set by their company admin;
 * Abhed issues a short-lived signed token, and every decision carries that verified identity.
 */

export const APPROVER_ROLES: Role[] = ['approver_l1', 'approver_l2', 'executive', 'rule_approver'];
export const ALL_ROLES: Role[] = ['approver_l1', 'approver_l2', 'executive', 'rule_approver', 'rule_author', 'agent_owner', 'operator', 'auditor'];
const RANK: Partial<Record<Role, number>> = { approver_l1: 1, approver_l2: 2, executive: 3 };
export const DEFAULT_PIN = '1234';

export const hashPin = (humanId: string, pin: string) => sha256(`kavach-pin:${humanId}:${pin}`);
export const checkPin = (h: Human, pin: string) => Boolean(h.pin) && h.pin === hashPin(h.id, String(pin));

const level = (h: Human) => Math.max(0, ...h.roles.map((r) => RANK[r] ?? 0));

/** Can this person decide this approval? Rule changes need a rule approver; actions need enough seniority. */
export function canDecide(h: Human, ap: Approval): { ok: boolean; why?: string } {
  if (ap.kind === 'rule_change') return h.roles.includes('rule_approver') ? { ok: true } : { ok: false, why: `${h.name} is not a rule approver.` };
  const need = RANK[ap.approverRole] ?? 1;
  if (level(h) >= need) return { ok: true };
  return { ok: false, why: `${h.name} (${h.title}) does not have ${ap.approverRole.replace('_', ' ').toUpperCase()} authority for this request.` };
}

export const isApprover = (h: Human) => h.roles.some((r) => APPROVER_ROLES.includes(r));

// ───────── tokens ─────────
const secret = () => process.env.KAVACH_AGENT_SECRET ?? process.env.SUPABASE_KEY ?? 'kavach-local-dev-secret';
const b64 = (s: string) => Buffer.from(s).toString('base64url');

export function signToken(tenant: string, humanId: string, ttlMs = 12 * 3_600_000) {
  const body = b64(JSON.stringify({ t: tenant, h: humanId, exp: Date.now() + ttlMs }));
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `kvp.${body}.${sig}`;
}

export function verifyToken(token: unknown): { tenant: string; humanId: string } | null {
  if (typeof token !== 'string' || !token.startsWith('kvp.')) return null;
  const [, body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', secret()).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { t: string; h: string; exp: number };
    if (Date.now() > p.exp) return null;
    return { tenant: p.t, humanId: p.h };
  } catch {
    return null;
  }
}

/** What a browser may see about a person (never the PIN hash). */
export const publicHuman = (h: Human) => ({ id: h.id, name: h.name, title: h.title, roles: h.roles, email: h.email, phone: h.phone, department: h.department, addedBy: h.addedBy, addedAt: h.addedAt, hasPin: Boolean(h.pin) });

/** Decision record of each person, computed from approvals and the ledger. */
export function personStats(w: World, h: Human) {
  const votes = w.approvals.flatMap((a) => a.votes.filter((v) => v.approverId === h.id || v.name.toLowerCase() === h.name.toLowerCase()).map((v) => ({ v, a })));
  const ms = votes.map((x) => x.v.decisionMs).sort((a, b) => a - b);
  const rejected = w.ledger.filter((r) => r.action === 'reject' && (r.approvers ?? []).includes(h.name)).length;
  const held = w.ledger.filter((r) => r.action === 'approval_hold' && r.actorId === h.id).length;
  const escalated = w.ledger.filter((r) => r.action === 'escalate' && r.actorId === h.id).length;
  const ownsAgents = w.agents.filter((a) => a.owner === h.id).map((a) => a.name);
  return {
    decisions: votes.length,
    approved: w.ledger.filter((r) => r.action === 'approve' && (r.approvers ?? []).includes(h.name)).length,
    rejected,
    held,
    escalated,
    medianSeconds: ms.length ? Math.round(ms[Math.floor(ms.length / 2)] / 100) / 10 : null,
    rubberStamps: w.oversight.filter((o) => o.approver.toLowerCase() === h.name.toLowerCase()).length,
    ownsAgents,
    recent: votes
      .sort((x, y) => y.v.at - x.v.at)
      .slice(0, 8)
      .map((x) => ({ id: x.a.id, summary: x.a.summary, status: x.a.status, at: x.v.at, seconds: Math.round(x.v.decisionMs / 100) / 10, device: x.v.device })),
  };
}
