import { appendLedger, GovError, human, nameOf } from './engine';
import { ALL_ROLES, APPROVER_ROLES, canDecide, DEFAULT_PIN, hashPin } from './people';
import type { Approval, Human, Role, World } from './types';

/**
 * What people can do with a request besides approve/reject:
 *   hold     → park it (agent keeps waiting, clock extended 30 min)
 *   escalate → send it up: L1 → L2 → executive
 *   assign   → route it to named people (admin)
 * And how a company admin manages its people.
 */

const HOLD_MS = 30 * 60_000;
const NEXT: Record<string, Approval['approverRole']> = { approver_l1: 'approver_l2', approver_l2: 'executive', executive: 'executive' };

function pending(w: World, id: string) {
  const ap = w.approvals.find((a) => a.id === id);
  if (!ap) throw new GovError('Approval not found', 404);
  if (ap.status !== 'PENDING') throw new GovError(`This request is already ${ap.status.toLowerCase()}.`, 409);
  return ap;
}

const note = (ap: Approval, by: string, what: string, now: number) => {
  ap.history ??= [];
  ap.history.push({ at: now, by, what });
};

function log(w: World, now: number, actorId: string, actorName: string, action: string, params: Record<string, unknown>, reason: string, ticketId?: string) {
  return appendLedger(w, { ts: now, actorType: actorId === 'admin' ? 'human' : 'human', actorId, actorName, action, params, decision: 'INFO', reason, ticketId });
}

/** `by` is a signed-in person id, or 'admin' for the company admin console. */
const who = (w: World, by: string) => (by === 'admin' ? { id: 'admin', name: 'Company admin' } : (human(w, by) ?? (() => { throw new GovError('Unknown person', 403); })()));

export function holdApproval(w: World, id: string, by: string, text = '', now = Date.now()) {
  const ap = pending(w, id);
  const p = who(w, by);
  if (by !== 'admin') {
    const can = canDecide(p as Human, ap);
    if (!can.ok) throw new GovError(can.why!, 403);
  }
  ap.hold = { by: p.name, at: now, note: text.slice(0, 160) || undefined };
  ap.expiresAt = Math.max(ap.expiresAt, now + HOLD_MS);
  note(ap, p.name, `put on hold${text ? `: ${text}` : ''}`, now);
  log(w, now, p.id, p.name, 'approval_hold', { approval: id }, `${p.name} put ${id} on hold${text ? ` (“${text.slice(0, 80)}”)` : ''}. The agent keeps waiting; nothing runs.`, ap.req.ticketId);
  return ap;
}

export function releaseHold(w: World, id: string, by: string, now = Date.now()) {
  const ap = pending(w, id);
  const p = who(w, by);
  ap.hold = undefined;
  note(ap, p.name, 'released from hold', now);
  log(w, now, p.id, p.name, 'approval_release', { approval: id }, `${p.name} released ${id} from hold.`);
  return ap;
}

export function escalateApproval(w: World, id: string, by: string, reason = '', now = Date.now()) {
  const ap = pending(w, id);
  const p = who(w, by);
  if (ap.kind === 'rule_change') throw new GovError('Rule changes already go to a rule approver.', 409);
  const from = ap.approverRole;
  const to = NEXT[from] ?? 'executive';
  if (from === to) throw new GovError('Already with the executive, the highest level.', 409);
  ap.approverRole = to;
  ap.escalationLevel += 1;
  ap.hold = undefined;
  ap.assignees = undefined;
  ap.escalateAt = now + 5 * 60_000;
  ap.expiresAt = Math.max(ap.expiresAt, now + 15 * 60_000);
  note(ap, p.name, `escalated ${from.replace('_', ' ')} → ${to.replace('_', ' ')}${reason ? `: ${reason}` : ''}`, now);
  log(w, now, p.id, p.name, 'escalate', { approval: id, from, to }, `${p.name} escalated ${id} from ${from.replace('_', ' ').toUpperCase()} to ${to.replace('_', ' ').toUpperCase()}${reason ? ` (“${reason.slice(0, 80)}”)` : ''}.`);
  return ap;
}

export function assignApproval(w: World, id: string, humanIds: string[], by = 'admin', now = Date.now()) {
  const ap = pending(w, id);
  const p = who(w, by);
  const people = humanIds.map((h) => human(w, h)).filter((h): h is Human => Boolean(h));
  const bad = people.filter((h) => !canDecide(h, ap).ok);
  if (bad.length) throw new GovError(`${bad.map((b) => b.name).join(', ')} cannot decide this (needs ${ap.kind === 'rule_change' ? 'a rule approver' : ap.approverRole.replace('_', ' ')}).`, 400);
  ap.assignees = [...new Set(people.map((h) => h.id))];
  note(ap, p.name, ap.assignees.length ? `assigned to ${people.map((h) => h.name).join(', ')}` : 'assignment cleared', now);
  log(w, now, p.id, p.name, 'approval_assign', { approval: id, to: ap.assignees.join(',') }, ap.assignees.length ? `${p.name} routed ${id} to ${people.map((h) => h.name).join(', ')}.` : `${p.name} cleared the routing of ${id}.`);
  return ap;
}

// ───────── people management (company admin) ─────────

const slug = (s: string) => s.toLowerCase().replace(/^(dr|mr|mrs|ms)\.?\s+/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'person';

export interface PersonInput {
  id?: string;
  name: string;
  title: string;
  roles: string[];
  email?: string;
  phone?: string;
  department?: string;
  pin?: string;
}

export function upsertPerson(w: World, input: PersonInput, now = Date.now()) {
  const name = String(input.name ?? '').trim().slice(0, 40);
  if (name.length < 2) throw new GovError('Name is required', 400);
  const roles = [...new Set((input.roles ?? []).filter((r): r is Role => (ALL_ROLES as string[]).includes(r)))];
  const existing = input.id ? human(w, input.id) : undefined;
  if (input.pin !== undefined && input.pin !== '' && !/^\d{4,6}$/.test(String(input.pin))) throw new GovError('PIN must be 4 to 6 digits', 400);
  if (existing) {
    const before = existing.roles.join(',');
    const oldRoles = existing.roles;
    existing.roles = roles;
    try {
      guardAuthority(w);
    } catch (e) {
      existing.roles = oldRoles; // refused changes must not half-apply
      throw e;
    }
    existing.name = name;
    existing.title = String(input.title ?? existing.title).slice(0, 50);
    existing.email = input.email?.slice(0, 80) || existing.email;
    existing.phone = input.phone?.slice(0, 20) || existing.phone;
    existing.department = input.department?.slice(0, 40) || existing.department;
    if (input.pin) existing.pin = hashPin(existing.id, String(input.pin));
    log(w, now, 'admin', 'Company admin', 'roster_change', { person: existing.id, roles: roles.join(',') }, `Admin updated ${name}: roles ${before || 'none'} → ${roles.join(', ') || 'none'}${input.pin ? '; PIN reset' : ''}.`);
    return existing;
  }
  let id = slug(name);
  while (human(w, id)) id = `${id}_${Math.floor(Math.random() * 90 + 10)}`;
  const h: Human = { id, name, title: String(input.title ?? 'Employee').slice(0, 50), roles, email: input.email?.slice(0, 80), phone: input.phone?.slice(0, 20), department: input.department?.slice(0, 40), pin: hashPin(id, String(input.pin || DEFAULT_PIN)), addedBy: 'admin', addedAt: now };
  w.humans.push(h);
  log(w, now, 'admin', 'Company admin', 'roster_change', { person: id, roles: roles.join(',') }, `Admin added ${name} (${h.title}) with ${roles.length ? roles.join(', ') : 'no approval rights'}.`);
  return h;
}

export function removePerson(w: World, id: string, now = Date.now()) {
  const h = human(w, id);
  if (!h) throw new GovError('Person not found', 404);
  const owns = w.agents.filter((a) => a.owner === id);
  if (owns.length) throw new GovError(`${h.name} owns ${owns.map((a) => a.name).join(', ')}. Hand those agents to someone else first: every agent needs an accountable owner.`, 409);
  w.humans = w.humans.filter((x) => x.id !== id);
  for (const ap of w.approvals) if (ap.assignees?.includes(id)) ap.assignees = ap.assignees.filter((x) => x !== id);
  try {
    guardAuthority(w);
  } catch (e) {
    w.humans.push(h);
    throw e;
  }
  log(w, now, 'admin', 'Company admin', 'roster_change', { person: id, removed: true }, `Admin removed ${h.name} (${h.title}). Their past decisions stay in the ledger.`);
}

/** A company can never lock itself out of governance. */
function guardAuthority(w: World) {
  if (!w.humans.some((h) => h.roles.includes('rule_approver'))) throw new GovError('At least one rule approver must remain.', 409);
  if (!w.humans.some((h) => h.roles.includes('approver_l2') || h.roles.includes('executive'))) throw new GovError('At least one Level-2 approver or executive must remain.', 409);
}

export const approverIds = (w: World) => w.humans.filter((h) => h.roles.some((r) => APPROVER_ROLES.includes(r))).map((h) => h.id);
export { nameOf };
