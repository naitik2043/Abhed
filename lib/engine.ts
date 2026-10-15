import type {
  ActionReq,
  Agent,
  Approval,
  ChainNode,
  Decision,
  Human,
  Incident,
  LedgerRecord,
  ReplayResult,
  Role,
  Rule,
  RuleWhen,
  Ticket,
  World,
} from './types';
import { canDecide } from './people';
import { dlpScan, OWASP, securityEvent } from './security';
import { packFor } from './sectors';
import { searchPolicies } from './sectors/policies';
import { canonical, inr, maskParams, sha256 } from './util';

export const GENESIS = '0'.repeat(64);
export const APPROVAL_TTL_MS = 15 * 60_000;
export const ESCALATE_AFTER_MS = 300_000; // unanswered for 5 minutes → the next level
export const READ_ONLY = new Set([
  'read_ticket',
  'read_customer',
  'draft_reply',
  'read_crm',
  'health_check',
  'read_logs',
  'lookup_transaction',
  'escalate_to_human',
  'resolve_ticket',
]);
export const HIGH_IMPACT = new Set([
  'issue_refund',
  'export_customers',
  'send_email',
  'delete_records',
  'update_rule',
  'rule_change',
  'restart_service',
  'transfer_funds',
  'approve',
]);

export const toolOf = (w: World, action: string) => packFor(w.sector).tools[action];
export const isReadOnly = (w: World, action: string) => READ_ONLY.has(action) || Boolean(toolOf(w, action)?.readOnly);
export const isHighImpact = (w: World, action: string) => {
  const t = toolOf(w, action);
  return t ? t.risk === 'high' || ['export_customers', 'export_patients', 'rule_change', 'update_rule', 'approve'].includes(action) : HIGH_IMPACT.has(action);
};
const OUTBOUND = new Set(['send_email', 'send_message', 'share_record', 'send_campaign']);

export class GovError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// ───────────────────────────── lookups ─────────────────────────────

export const human = (w: World, id: string): Human | undefined => w.humans.find((h) => h.id === id);
export const agent = (w: World, id: string): Agent | undefined => w.agents.find((a) => a.id === id);
export const nameOf = (w: World, id: string) => human(w, id)?.name ?? agent(w, id)?.name ?? id;

export function activeRules(w: World): Rule[] {
  // latest active version of each rule id
  const latest = new Map<string, Rule>();
  for (const r of w.rules) {
    if (!r.active) continue;
    const cur = latest.get(r.id);
    if (!cur || r.version > cur.version) latest.set(r.id, r);
  }
  return [...latest.values()];
}

// ───────────────────────────── ledger ─────────────────────────────

type NewRecord = Omit<LedgerRecord, 'seq' | 'prevHash' | 'hash' | 'ts' | 'cost' | 'dataTouched' | 'approvers' | 'outcome'> &
  Partial<Pick<LedgerRecord, 'ts' | 'cost' | 'dataTouched' | 'approvers' | 'outcome'>>;

export function recordBody(r: LedgerRecord) {
  // perf is a timing measurement written after the decision; it is not evidence, so it is not hashed
  const { hash: _h, perf: _p, ...body } = r;
  return body;
}

export function hashRecord(r: LedgerRecord): string {
  return sha256(r.prevHash + canonical(recordBody(r)));
}

export function appendLedger(w: World, rec: NewRecord): LedgerRecord {
  const prev = w.ledger[w.ledger.length - 1];
  const full: LedgerRecord = {
    ts: Date.now(),
    cost: 0,
    dataTouched: [],
    approvers: [],
    outcome: 'n/a',
    ...rec,
    params: maskParams(rec.params),
    seq: prev ? prev.seq + 1 : 1,
    prevHash: prev ? prev.hash : GENESIS,
    hash: '',
  };
  full.hash = hashRecord(full);
  w.ledger.push(full);
  return full;
}

export function verifyLedger(w: World): { valid: boolean; firstBadSeq: number | null; checked: number } {
  let prev = GENESIS;
  for (const r of w.ledger) {
    if (r.prevHash !== prev || hashRecord(r) !== r.hash) {
      return { valid: false, firstBadSeq: r.seq, checked: w.ledger.length };
    }
    prev = r.hash;
  }
  return { valid: true, firstBadSeq: null, checked: w.ledger.length };
}

/** Outcomes are appended, never edited: the effective outcome of a record is its latest OUTCOME entry. */
export function effectiveOutcomes(w: World): Map<number, LedgerRecord['outcome']> {
  const m = new Map<number, LedgerRecord['outcome']>();
  for (const r of w.ledger) {
    if (r.outcome !== 'n/a' && r.action !== 'outcome') m.set(r.seq, r.outcome);
    if (r.action === 'outcome' && typeof r.meta?.forSeq === 'number') m.set(r.meta.forSeq as number, r.outcome);
  }
  return m;
}

// ───────────────────────────── rules ─────────────────────────────

export interface Ctx {
  action: string;
  amount?: number;
  records?: number;
  beneficiaryChangedDays?: number;
  external?: boolean;
  untrusted?: boolean;
  customerData?: boolean;
  percent?: number;
  flags?: string[];
  actorType: 'agent' | 'human';
}

export function ctxFor(w: World, req: ActionReq): Ctx {
  const p = req.params;
  const amount = typeof p.amount === 'number' ? p.amount : undefined;
  const records = typeof p.records === 'number' ? p.records : undefined;
  let beneficiaryChangedDays = typeof p.beneficiary_changed_days === 'number' ? p.beneficiary_changed_days : undefined;
  if (beneficiaryChangedDays === undefined && typeof p.customer === 'string') {
    const c = w.customers.find((x) => x.id === p.customer);
    if (c && (!p.to_account || p.to_account === 'own')) beneficiaryChangedDays = c.accountChangedDaysAgo;
  }
  if (beneficiaryChangedDays === undefined && typeof p.to_account === 'string' && p.to_account !== 'own') {
    beneficiaryChangedDays = 0; // never-seen beneficiary
  }
  const to = typeof p.to === 'string' ? p.to.toLowerCase() : '';
  // replying to the ticket's own customer is not "outside the bank" for leak purposes
  const ticket = req.ticketId ? w.tickets.find((t) => t.id === req.ticketId) : undefined;
  const ticketCustomerEmail = ticket ? w.customers.find((c) => c.id === ticket.customerId)?.email?.toLowerCase() : undefined;
  const pack = packFor(w.sector);
  const knownCustomer = w.customers.some((c) => c.email?.toLowerCase() === to);
  const external =
    req.action === 'send_email'
      ? !to.endsWith('@' + pack.domain) && to !== ticketCustomerEmail && !knownCustomer
      : req.action === 'export_customers'
        ? true
        : undefined;
  const extra = pack.enrich(w, req);
  const flags = [...(extra.flags ?? [])];
  if (isHighImpact(w, req.action)) flags.push('__high_impact');
  return {
    action: req.action,
    amount: extra.amount ?? amount,
    records: extra.records ?? records,
    beneficiaryChangedDays: extra.beneficiaryChangedDays ?? beneficiaryChangedDays,
    external: extra.external ?? external,
    percent: extra.percent,
    flags,
    untrusted: req.session?.untrusted,
    customerData: req.session?.customerData,
    actorType: req.actorType,
  };
}

export function matches(when: RuleWhen, c: Ctx): boolean {
  if (when.action && when.action !== c.action) return false;
  if (when.actionIn && !when.actionIn.includes(c.action)) return false;
  if (when.actor_type && when.actor_type !== c.actorType) return false;
  if (when.amount_gt !== undefined && !(c.amount !== undefined && c.amount > when.amount_gt)) return false;
  if (when.amount_lte !== undefined && !(c.amount !== undefined && c.amount <= when.amount_lte)) return false;
  if (when.records_gt !== undefined && !(c.records !== undefined && c.records > when.records_gt)) return false;
  if (when.percent_gt !== undefined && !(c.percent !== undefined && c.percent > when.percent_gt)) return false;
  if (when.flag !== undefined && !(c.flags ?? []).includes(when.flag)) return false;
  if (
    when.beneficiary_changed_days_lte !== undefined &&
    !(c.beneficiaryChangedDays !== undefined && c.beneficiaryChangedDays <= when.beneficiary_changed_days_lte)
  )
    return false;
  if (when.external !== undefined && Boolean(c.external) !== when.external) return false;
  if (when.session_untrusted !== undefined && Boolean(c.untrusted) !== when.session_untrusted) return false;
  if (when.session_customer_data !== undefined && Boolean(c.customerData) !== when.session_customer_data) return false;
  return true;
}

export interface Evaluation {
  decision: Decision;
  rule?: Rule;
  matched: Rule[];
  reasons: string[];
  approverRole: Role;
  twoKey: number;
  critical: boolean;
}

const ROLE_RANK: Record<string, number> = { approver_l1: 1, rule_approver: 2, approver_l2: 3, executive: 4 };

export function evaluateRules(rules: Rule[], c: Ctx): Evaluation {
  const matched = rules.filter((r) => matches(r.when, c));
  const blocked = matched.filter((r) => r.decision === 'BLOCKED');
  if (blocked.length) {
    const r = blocked.find((b) => b.severity === 'critical') ?? blocked[0];
    return {
      decision: 'BLOCKED',
      rule: r,
      matched,
      reasons: blocked.map((b) => b.says),
      approverRole: 'approver_l1',
      twoKey: 1,
      critical: blocked.some((b) => b.severity === 'critical'),
    };
  }
  const holds = matched.filter((r) => r.decision === 'NEEDS_APPROVAL');
  if (holds.length) {
    const strongest = [...holds].sort(
      (a, b) =>
        (ROLE_RANK[b.approverRole ?? 'approver_l1'] ?? 0) - (ROLE_RANK[a.approverRole ?? 'approver_l1'] ?? 0) ||
        (b.twoKey ?? 1) - (a.twoKey ?? 1),
    )[0];
    return {
      decision: 'NEEDS_APPROVAL',
      rule: strongest,
      matched,
      reasons: holds.map((h) => h.says),
      approverRole: strongest.approverRole ?? 'approver_l1',
      twoKey: Math.max(...holds.map((h) => h.twoKey ?? 1)),
      critical: false,
    };
  }
  const allow = matched.find((r) => r.decision === 'ALLOWED');
  if (allow) {
    return { decision: 'ALLOWED', rule: allow, matched, reasons: [allow.says], approverRole: 'approver_l1', twoKey: 1, critical: false };
  }
  if (c.flags ? c.flags.includes('__high_impact') : HIGH_IMPACT.has(c.action)) {
    return {
      decision: 'NEEDS_APPROVAL',
      matched,
      reasons: ['No rule covers this high-impact action, so a person decides.'],
      approverRole: 'approver_l1',
      twoKey: 1,
      critical: false,
    };
  }
  return { decision: 'ALLOWED', matched, reasons: ['Low-impact action inside the agent’s purpose.'], approverRole: 'approver_l1', twoKey: 1, critical: false };
}

// ───────────────────────────── gateway ─────────────────────────────

export interface GatewayResult {
  decision: Decision;
  reason: string;
  ruleRef?: string;
  seq: number;
  approvalId?: string;
  paused?: boolean;
  output?: unknown;
  category?: string;
  gatewayMs?: number;
}

const VALUE_PER_ACTION: Record<string, number> = {
  read_ticket: 18,
  read_customer: 12,
  draft_reply: 60,
  issue_refund: 90,
  read_crm: 20,
  draft_email: 75,
  export_report: 140,
  health_check: 35,
  read_logs: 25,
  restart_service: 400,
  send_email: 40,
  lookup_transaction: 15,
  escalate_to_human: 10,
  resolve_ticket: 25,
};

function dataTouchedFor(req: ActionReq, w?: World): string[] {
  const cls = w ? toolOf(w, req.action)?.dataClass : undefined;
  if (cls) return cls.split(',').map((x) => x.trim());
  switch (req.action) {
    case 'issue_refund':
      return ['customer_profile', 'transactions', 'beneficiary'];
    case 'read_customer':
      return ['customer_profile (masked)'];
    case 'export_customers':
      return ['ALL customer records', 'PAN', 'phone'];
    case 'send_email':
      return ['outbound email'];
    case 'read_ticket':
      return ['ticket text'];
    case 'export_report':
      return ['aggregates only'];
    case 'lookup_transaction':
      return ['transactions (masked)'];
    case 'read_crm':
      return ['CRM lead'];
    default:
      return [];
  }
}

export function actionHash(req: ActionReq): string {
  return sha256(canonical({ actor: req.actorId, action: req.action, params: req.params }));
}

export function describeAction(w: World, req: ActionReq): string {
  const custom = packFor(w.sector).describe(w, req);
  if (custom) return custom;
  const p = req.params;
  const who = nameOf(w, req.actorId);
  switch (req.action) {
    case 'issue_refund': {
      const cust = w.customers.find((c) => c.id === p.customer);
      const to = p.to_account && p.to_account !== 'own' ? ` to account ••••${String(p.to_account).slice(-4)}` : '';
      return `${who} → refund ${inr(Number(p.amount))}${cust ? ` to ${cust.name}` : ''}${to}`;
    }
    case 'export_customers':
      return `${who} → export ${Number(p.records ?? 0).toLocaleString('en-IN')} customer records`;
    case 'send_email':
      return `${who} → email ${String(p.to)}${p.attach ? ` with ${String(p.attach)}` : ''}`;
    case 'rule_change':
      return `${who} → activate rule ${String(p.ruleId)}: “${String(p.says)}”`;
    case 'restart_service':
      return `${who} → restart ${String(p.service)} (${String(p.env ?? 'production')})`;
    case 'delete_records':
      return `${who} → delete ${String(p.table ?? 'records')}`;
    case 'update_rule':
      return `${who} → change rule ${String(p.rule ?? '')}`;
    case 'approve':
      return `${who} → approve ${String(p.approval ?? '')}`;
    default:
      return `${who} → ${req.action.replace(/_/g, ' ')}`;
  }
}

const APPROVAL_PREFIX: Record<string, string> = { banking: 'APR', healthcare: 'APH', ecommerce: 'APE' };
function newApprovalId(w: World) {
  w.counters.approval += 1;
  return `${APPROVAL_PREFIX[w.sector] ?? 'APR'}-${w.counters.approval}`;
}
/** Approval ids carry their company, so a phone approval always reaches the right tenant. */
export const tenantOfApproval = (id: string) => (id.startsWith('APH-') ? 'healthcare' : id.startsWith('APE-') ? 'ecommerce' : 'banking');

export function gateway(w: World, req: ActionReq, opts: { now?: number; reasoning?: string } = {}): GatewayResult {
  const t0 = performance.now();
  const r = gatewayInner(w, req, opts);
  r.gatewayMs = Number((performance.now() - t0).toFixed(2));
  const rec = w.ledger.find((x) => x.seq === r.seq);
  if (rec) rec.perf = { gatewayMs: r.gatewayMs, category: r.category };
  return r;
}

function gatewayInner(w: World, req: ActionReq, opts: { now?: number; reasoning?: string }): GatewayResult {
  const now = opts.now ?? Date.now();
  const desc = describeAction(w, req);

  // 1 · identity
  if (req.actorType === 'agent') {
    const a = agent(w, req.actorId);
    if (!a) {
      const u = w.unregistered.find((x) => x.id === req.actorId);
      if (u) {
        u.attempts += 1;
        u.at = now;
        u.lastAction = req.action;
      } else w.unregistered.push({ id: req.actorId, at: now, attempts: 1, lastAction: req.action });
      const rec = appendLedger(w, {
        ts: now,
        actorType: 'unknown',
        actorId: req.actorId,
        actorName: req.actorId,
        action: req.action,
        params: req.params,
        decision: 'BLOCKED',
        reason: 'Unregistered agent: no passport, no owner, so fail-closed. Shadow AI detected.',
        outcome: 'blocked',
      });
      return { decision: 'BLOCKED', reason: rec.reason, seq: rec.seq };
    }
  }

  const a = req.actorType === 'agent' ? agent(w, req.actorId)! : undefined;
  const owner = a ? human(w, a.owner) : human(w, req.actorId);
  const onBehalfOf = owner?.name;

  const block = (reason: string, ruleRef?: string, critical = false, category?: string): GatewayResult => {
    const rec = appendLedger(w, {
      ts: now,
      actorType: req.actorType,
      actorId: req.actorId,
      actorName: nameOf(w, req.actorId),
      onBehalfOf,
      action: req.action,
      params: req.params,
      dataTouched: [],
      decision: 'BLOCKED',
      ruleRef,
      reason,
      outcome: 'blocked',
      ticketId: req.ticketId,
      meta: { critical, desc, category, channel: req.channel ?? 'live', amount: req.params.amount, records: req.params.records },
    });
    let paused = false;
    if (a && critical && a.status !== 'PAUSED') {
      pauseAgent(w, a.id, 'system', `Auto-paused: critical breach (${ruleRef ?? 'policy'}) at record #${rec.seq}`, now);
      openBreachIncident(w, a, rec, now, Boolean(req.session?.untrusted));
      paused = true;
    }
    if (a) monitorRunaway(w, a, now);
    return { decision: 'BLOCKED', reason, ruleRef, seq: rec.seq, paused, category };
  };

  if (a) {
    if (a.status === 'PAUSED' || a.keyRevoked) {
      return block(`${a.name} is paused (${a.statusReason ?? 'by owner'}). Its key is revoked, so the call is refused at the gateway.`);
    }
    // agents can never approve or change rules
    if (req.action === 'approve' || req.action === 'update_rule' || req.action === 'rule_change') {
      securityEvent(w, { kind: 'self-governance attempt', agentId: a.id, detail: `${a.name} tried to ${req.action.replace(/_/g, ' ')}`, owasp: OWASP.ASI03, severity: 'critical' }, now);
      return block('Agents can never approve actions or change rules. Only people can.', 'AGENT-NO-SELF-GOVERN@1', true, 'privilege');
    }
  }

  // 1b · scope: a session opened for one customer can only touch that customer (no confused deputy)
  const subject = req.session?.subject;
  if (a && subject) {
    const p = req.params;
    const order = typeof p.order === 'string' ? (w.biz.orders ?? []).find((o) => o.id === p.order) : undefined;
    const target = (typeof p.customer === 'string' && p.customer) || (typeof p.patient === 'string' && p.patient) || (order ? String(order.customer) : undefined);
    if (target && target !== subject) {
      securityEvent(w, { kind: 'scope violation', agentId: a.id, detail: `${a.name} tried ${req.action} on ${target} inside a session for ${subject}`, owasp: OWASP.ASI03, severity: 'high' }, now);
      return block(`Out of scope: this session is for ${subject}, but the agent tried to act on ${target}.`, 'SCOPE@1', false, 'scope');
    }
  }

  // 2 · delegation (a live human grant)
  let delegationHold: string | undefined;
  if (a && !isReadOnly(w, req.action) && !toolOf(w, req.action)?.noDelegation && req.action !== 'draft_email' && req.action !== 'export_report') {
    const d = a.delegations.find((x) => x.action === req.action);
    if (!d) {
      const critical = isHighImpact(w, req.action);
      // let rules name the critical breach if one matches
      const ev = evaluateRules(activeRules(w), ctxFor(w, req));
      const ruleRef = ev.decision === 'BLOCKED' && ev.rule ? `${ev.rule.id}@${ev.rule.version}` : undefined;
      securityEvent(
        w,
        { kind: 'tool misuse', agentId: a.id, detail: `${a.name} called ${req.action} without a human grant`, owasp: critical ? OWASP.ASI10 : OWASP.ASI02, severity: critical ? 'critical' : 'medium' },
        now,
      );
      return block(
        `No human delegated “${req.action.replace(/_/g, ' ')}” to ${a.name}.${ev.decision === 'BLOCKED' ? ' ' + ev.reasons[0] : ''}`,
        ruleRef,
        critical,
        'delegation',
      );
    }
    const amount = typeof req.params.amount === 'number' ? req.params.amount : 0;
    if (d.maxPerAction !== undefined && amount > d.maxPerAction) {
      delegationHold = `${inr(amount)} is above the ${inr(d.maxPerAction)} per-action limit ${nameOf(w, d.grantedBy)} delegated to ${a.name}.`;
    } else if (d.maxPerDay !== undefined && a.spentToday + amount > d.maxPerDay) {
      delegationHold = `Daily delegation of ${inr(d.maxPerDay)} would be exceeded (${inr(a.spentToday)} used).`;
    }
  }
  if (a && a.status === 'RESTRICTED' && !isReadOnly(w, req.action)) {
    delegationHold = delegationHold ?? `${a.name} is restricted by ${a.statusBy ?? 'its owner'}: only read actions run on their own.`;
  }

  // 3 · grounding: the action must match the system of record (hallucination guard)
  const ungrounded = packFor(w.sector).ground(w, req);
  if (ungrounded) {
    if (a) securityEvent(w, { kind: 'hallucination', agentId: a.id, detail: ungrounded, owasp: OWASP.LLM09, severity: 'medium' }, now);
    return block(ungrounded, 'GROUNDING@1', false, 'hallucination');
  }

  // 4 · data-loss prevention on anything leaving the organisation
  if (OUTBOUND.has(req.action)) {
    const leaks = dlpScan(req.params);
    if (leaks.length) {
      if (a) securityEvent(w, { kind: 'data leak', agentId: a.id, detail: `Outbound ${req.action} carried ${leaks.join(', ')}`, owasp: OWASP.LLM02, severity: 'high' }, now);
      return block(`DLP: outbound message contains ${leaks.join(', ')}. Sensitive data never leaves without a person.`, 'DLP@1', false, 'dlp');
    }
  }

  // 5 · rules (block wins; unknown high-impact → a person)
  const ev = evaluateRules(activeRules(w), ctxFor(w, req));
  const ruleRef = ev.rule ? `${ev.rule.id}@${ev.rule.version}` : undefined;
  if (ev.decision === 'BLOCKED') {
    if (a && ev.critical) securityEvent(w, { kind: 'policy breach', agentId: a.id, detail: ev.reasons[0], owasp: OWASP.ASI10, severity: 'critical' }, now);
    return block(ev.reasons[0], ruleRef, ev.critical, 'policy');
  }

  // 6 · checkpoint (only high-impact actions reach a person)
  if (ev.decision === 'NEEDS_APPROVAL' || delegationHold) {
    const why = [delegationHold, ev.decision === 'NEEDS_APPROVAL' ? ev.reasons[0] : undefined].filter(Boolean).join(' ');
    const approverRole: Role = ev.decision === 'NEEDS_APPROVAL' ? ev.approverRole : 'approver_l1';
    const twoKey = ev.decision === 'NEEDS_APPROVAL' ? ev.twoKey : 1;
    // the same action already waiting for a person: point to that request, never open a second one
    const dup = w.approvals.find((x) => x.status === 'PENDING' && x.actionHash === actionHash(req));
    if (dup) {
      const rec = appendLedger(w, { ts: now, actorType: req.actorType, actorId: req.actorId, actorName: nameOf(w, req.actorId), onBehalfOf, action: req.action, params: req.params, decision: 'NEEDS_APPROVAL', reason: `Same action already waiting for a person as ${dup.id}; no duplicate request opened.`, outcome: 'held', ticketId: req.ticketId, meta: { approvalId: dup.id, desc, duplicateOf: dup.id } });
      return { decision: 'NEEDS_APPROVAL', reason: `Already waiting for a person (${dup.id}).`, ruleRef, seq: rec.seq, approvalId: dup.id, category: 'checkpoint' };
    }
    const id = newApprovalId(w);
    const rec = appendLedger(w, {
      ts: now,
      actorType: req.actorType,
      actorId: req.actorId,
      actorName: nameOf(w, req.actorId),
      onBehalfOf,
      action: req.action,
      params: req.params,
      dataTouched: dataTouchedFor(req, w),
      decision: 'NEEDS_APPROVAL',
      ruleRef: ev.decision === 'NEEDS_APPROVAL' ? ruleRef : undefined,
      reason: `Waiting for a person (${approverRole.replace('_', ' ').toUpperCase()}${twoKey > 1 ? ` × ${twoKey}` : ''}). ${why}`,
      outcome: 'held',
      ticketId: req.ticketId,
      meta: { approvalId: id, desc, channel: req.channel ?? 'live', ...refundMeta(w, req) },
    });
    const ownerCannot = ev.matched.some((r) => r.ownerCannotApprove);
    const approval: Approval = {
      id,
      kind: req.action === 'rule_change' ? 'rule_change' : 'action',
      req,
      actionHash: actionHash(req),
      summary: desc,
      why,
      ruleIds: ev.matched.filter((r) => r.decision === 'NEEDS_APPROVAL').map((r) => `${r.id}@${r.version}`),
      approverRole,
      twoKey,
      ownerId: ownerCannot ? (a ? a.owner : req.actorId) : undefined,
      evidence: evidenceFor(w, req, a),
      agentReasoning: opts.reasoning,
      votes: [],
      status: 'PENDING',
      createdAt: now,
      expiresAt: now + APPROVAL_TTL_MS,
      escalateAt: now + ESCALATE_AFTER_MS,
      escalationLevel: 0,
      ledgerSeq: rec.seq,
    };
    w.approvals.push(approval);
    if (req.ticketId) moveTicket(w, req.ticketId, 'AGENT_REVIEW', `Held: ${approverRole.replace('_', ' ')} must approve`);
    return { decision: 'NEEDS_APPROVAL', reason: why, ruleRef, seq: rec.seq, approvalId: id, category: 'checkpoint' };
  }

  // 7 · execute against the systems of record + ledger
  const { rec, output } = execute(w, req, { now, ruleRef, reason: ev.reasons[0], approvers: [] });
  if (a) monitorRunaway(w, a, now);
  return { decision: 'ALLOWED', reason: ev.reasons[0], ruleRef, seq: rec.seq, output, category: 'auto' };
}

function execute(
  w: World,
  req: ActionReq,
  o: { now: number; ruleRef?: string; reason: string; approvers: string[]; approvalId?: string },
): { rec: LedgerRecord; output: unknown } {
  const a = req.actorType === 'agent' ? agent(w, req.actorId) : undefined;
  const owner = a ? human(w, a.owner) : human(w, req.actorId);
  let outcome: LedgerRecord['outcome'] = 'confirmed';
  if (req.action === 'issue_refund') {
    outcome = 'pending';
    if (a) a.spentToday += Number(req.params.amount ?? 0);
  }
  if (req.action === 'rule_change') activateRule(w, req, o.approvers, o.now);
  let output: unknown;
  try {
    output = req.action === 'search_policy' ? searchPolicies(w.sector, String(req.params.query ?? '')) : packFor(w.sector).effect(w, req);
  } catch (e) {
    output = { error: e instanceof Error ? e.message : String(e) };
  }
  const shown = output === undefined ? {} : { output: maskOutput(output) };
  const cost = a ? Number((0.35 + (req.action.length % 5) * 0.21).toFixed(2)) : 0;
  const value = a ? VALUE_PER_ACTION[req.action] ?? 30 : 0;
  const rec = appendLedger(w, {
    ts: o.now,
    actorType: req.actorType,
    actorId: req.actorId,
    actorName: nameOf(w, req.actorId),
    onBehalfOf: owner?.name,
    action: req.action,
    params: req.params,
    dataTouched: dataTouchedFor(req, w),
    decision: o.approvers.length ? 'EXECUTED' : 'ALLOWED',
    ruleRef: o.ruleRef,
    reason: o.reason,
    approvers: o.approvers,
    outcome,
    ticketId: req.ticketId,
    cost,
    meta: { value, approvalId: o.approvalId, desc: describeAction(w, req), channel: req.channel ?? 'live', ...refundMeta(w, req), ...shown },
  });
  if (req.ticketId && req.action === 'escalate_to_human') {
    moveTicket(w, req.ticketId, 'HUMAN', `Agent escalated: ${String(req.params.reason ?? 'needs a person')}`, 'isha');
  } else if (req.ticketId && (req.action === 'resolve_ticket' || !isReadOnly(w, req.action))) {
    const t = w.tickets.find((x) => x.id === req.ticketId);
    if (t && t.lane !== 'HUMAN' && t.lane !== 'ESCALATED' && (t.lane !== 'AGENT_REVIEW' || o.approvers.length))
      moveTicket(w, req.ticketId, 'DONE', o.approvers.length ? `Done after approval by ${o.approvers.join(' + ')}` : 'Done by agent within limits');
  }
  return { rec, output };
}

/** Outputs are stored for the audit trail, but never with raw PII. */
function maskOutput(o: unknown): unknown {
  const s = JSON.stringify(o) ?? '';
  if (s.length > 600) return { summary: s.slice(0, 600) + '…' };
  return JSON.parse(s.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, (m) => m[0] + '•••@' + m.split('@')[1]));
}

export function refundMeta(w: World, req: ActionReq): Record<string, unknown> {
  if (req.action !== 'issue_refund') return {};
  const c = ctxFor(w, req);
  const cust = w.customers.find((x) => x.id === req.params.customer);
  const t = req.ticketId ? w.tickets.find((x) => x.id === req.ticketId) : undefined;
  return {
    amount: c.amount,
    beneficiaryChangedDays: c.beneficiaryChangedDays,
    customer: cust?.id,
    customerName: cust?.name,
    ticketSubject: t?.subject,
  };
}

function evidenceFor(w: World, req: ActionReq, a?: Agent) {
  const ev: { label: string; value: string }[] = [];
  const p = req.params;
  if (typeof p.customer === 'string') {
    const c = w.customers.find((x) => x.id === p.customer);
    if (c) {
      ev.push({ label: 'Customer', value: `${c.name} · ${c.tier} · KYC ${c.kyc}` });
      ev.push({ label: 'Beneficiary', value: c.accountChangedDaysAgo > 60 ? `Unchanged for ${c.accountChangedDaysAgo} days` : `Changed ${c.accountChangedDaysAgo} days ago` });
      const disputes = w.ledger.filter((r) => r.action === 'outcome' && r.outcome === 'disputed' && r.meta?.customer === c.id).length;
      ev.push({ label: 'Past disputes', value: disputes ? `${disputes} open` : 'None on record' });
    }
  }
  if (a) {
    const d = a.delegations.find((x) => x.action === req.action);
    if (d?.maxPerDay) ev.push({ label: 'Delegation', value: `From ${nameOf(w, d.grantedBy)} · ${inr(d.maxPerDay - a.spentToday)} left today` });
    ev.push({ label: 'Agent', value: `${a.name} · ${a.framework} · ${a.model} (${a.modelVersion}) · risk ${a.risk}` });
  }
  if (req.ticketId) {
    const t = w.tickets.find((x) => x.id === req.ticketId);
    if (t) ev.push({ label: 'Ticket', value: `${t.id} · ${t.subject} · via ${t.channel}` });
  }
  if (req.action === 'rule_change') {
    ev.push({ label: 'Proposed by', value: nameOf(w, req.actorId) });
    if (typeof p.replay === 'string') ev.push({ label: 'Replay proof', value: p.replay });
  }
  return ev;
}

// ───────────────────────────── approvals ─────────────────────────────

export interface DecideInput {
  decision: 'approve' | 'reject';
  name: string;
  /** a signed-in approver; when present, Abhed checks their authority instead of trusting a typed name */
  approverId?: string;
  actionHash: string;
  decisionMs: number;
  evidenceViewed: boolean;
  device?: string;
}

export function decideApproval(w: World, id: string, input: DecideInput, now = Date.now()) {
  const ap = w.approvals.find((x) => x.id === id);
  if (!ap) throw new GovError('Approval not found', 404);
  if (ap.status !== 'PENDING') throw new GovError(`This approval is already ${ap.status.toLowerCase()}.`, 409);
  let name = input.name.trim().slice(0, 40) || 'Guest Judge';
  if (input.approverId) {
    const h = human(w, input.approverId);
    if (!h) throw new GovError('This approver is no longer registered with the company.', 403);
    const can = canDecide(h, ap);
    if (!can.ok) throw new GovError(`${can.why} Escalate it or ask someone senior.`, 403);
    if (ap.kind === 'rule_change' && ap.req.actorId === h.id) throw new GovError(`${h.name} proposed this rule, so a second person must approve it.`, 403);
    name = h.name;
  }

  if (now > ap.expiresAt) {
    ap.status = 'EXPIRED';
    appendLedger(w, sys(w, now, 'approval_expired', { approval: id }, 'VOID', `Approval ${id} expired before anyone decided.`));
    throw new GovError('This approval expired.', 410);
  }
  // bound to the exact action: any change voids it
  const current = actionHash(ap.req);
  if (current !== ap.actionHash || input.actionHash !== ap.actionHash) {
    ap.status = 'VOID';
    appendLedger(w, {
      ts: now,
      actorType: 'system',
      actorId: 'abhed',
      actorName: 'Abhed',
      action: 'approval_void',
      params: { approval: id },
      decision: 'VOID',
      reason: `Approval ${id} void: the action changed after the request. Approvals cover only the exact action a person saw.`,
    });
    throw new GovError('The action changed after you opened it, so this approval is void.', 409);
  }
  const owner = ap.ownerId ? human(w, ap.ownerId) : undefined;
  if (owner && owner.name.toLowerCase() === name.toLowerCase()) {
    throw new GovError(`${owner.name} cannot approve their own ${ap.kind === 'rule_change' ? 'rule change' : "agent's action"}. A second person must.`, 403);
  }
  if (ap.votes.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
    throw new GovError('Two-key means two different people. You already approved this.', 403);
  }

  const vote = { name, approverId: input.approverId, at: now, decisionMs: input.decisionMs, evidenceViewed: input.evidenceViewed, device: input.device ?? 'phone' };

  // oversight of the overseer: rubber-stamp detection
  if (input.decision === 'approve' && input.decisionMs < 4000 && !input.evidenceViewed) {
    const note = `${name} approved in ${(input.decisionMs / 1000).toFixed(1)} s without opening the evidence.`;
    w.oversight.unshift({ at: now, approver: name, approvalId: id, decisionMs: input.decisionMs, evidenceViewed: false, note });
    appendLedger(w, {
      ts: now,
      actorType: 'system',
      actorId: 'abhed',
      actorName: 'Abhed · Oversight',
      action: 'oversight_flag',
      params: { approval: id, decision_ms: input.decisionMs },
      decision: 'FLAG',
      reason: `Possible rubber-stamp: ${note}`,
    });
  }

  if (input.decision === 'reject') {
    ap.votes.push(vote);
    ap.status = 'REJECTED';
    appendLedger(w, {
      ts: now,
      actorType: 'human',
      actorId: 'judge',
      actorName: name,
      action: 'reject',
      params: { approval: id },
      decision: 'BLOCKED',
      ruleRef: ap.ruleIds[0],
      reason: `${name} rejected: ${ap.summary}`,
      approvers: [name],
      outcome: 'blocked',
      ticketId: ap.req.ticketId,
      meta: { approvalId: id },
    });
    if (ap.req.ticketId) moveTicket(w, ap.req.ticketId, 'HUMAN', `Rejected by ${name}; a person handles it`);
    return ap;
  }

  ap.votes.push(vote);
  appendLedger(w, {
    ts: now,
    actorType: 'human',
    actorId: 'judge',
    actorName: name,
    action: 'approve',
    params: { approval: id, action_hash: ap.actionHash.slice(0, 12) },
    decision: 'INFO',
    ruleRef: ap.ruleIds[0],
    reason: `${name} approved ${ap.summary} (key ${ap.votes.length}/${ap.twoKey}, decided in ${(input.decisionMs / 1000).toFixed(1)} s).`,
    approvers: [name],
    meta: { approvalId: id },
  });
  if (ap.votes.length < ap.twoKey) return ap;

  // the world may have changed while the person decided: re-check against the system of record
  const stale = packFor(w.sector).ground(w, ap.req);
  if (stale) {
    ap.status = 'VOID';
    appendLedger(w, {
      ts: now,
      actorType: 'system',
      actorId: 'abhed',
      actorName: 'Abhed · Grounding',
      action: ap.req.action,
      params: ap.req.params,
      decision: 'VOID',
      ruleRef: 'GROUNDING@1',
      reason: `Approved, but no longer true at execution time: ${stale}`,
      outcome: 'blocked',
      ticketId: ap.req.ticketId,
      meta: { approvalId: id, category: 'hallucination' },
    });
    return ap;
  }
  ap.status = 'APPROVED';
  const { rec, output } = execute(w, ap.req, {
    now,
    ruleRef: ap.ruleIds[0],
    reason: `Approved by ${ap.votes.map((v) => v.name).join(' + ')} for exactly this action (hash ${ap.actionHash.slice(0, 10)}…).`,
    approvers: ap.votes.map((v) => v.name),
    approvalId: id,
  });
  ap.status = 'EXECUTED';
  ap.usedAt = now;
  ap.executedSeq = rec.seq;
  ap.output = output;
  return ap;
}

/** An agent tries to reuse an approval, optionally with different params (e.g. ₹1 more). */
export function reuseApproval(w: World, id: string, params: Record<string, unknown>, now = Date.now()) {
  const ap = w.approvals.find((x) => x.id === id);
  if (!ap) throw new GovError('Approval not found', 404);
  const attempted: ActionReq = { ...ap.req, params };
  const sameHash = actionHash(attempted) === ap.actionHash;
  const reason = !sameHash
    ? `Refused: ${ap.id} covers ${describeAction(w, ap.req)} exactly. ${describeAction(w, attempted)} has a different fingerprint, so it needs a new approval.`
    : `Refused: ${ap.id} was single-use and is already spent (record #${ap.executedSeq}).`;
  const rec = appendLedger(w, {
    ts: now,
    actorType: ap.req.actorType,
    actorId: ap.req.actorId,
    actorName: nameOf(w, ap.req.actorId),
    action: ap.req.action,
    params,
    decision: 'VOID',
    ruleRef: ap.ruleIds[0],
    reason,
    outcome: 'blocked',
    meta: { approvalId: id, desc: describeAction(w, attempted) },
  });
  return { seq: rec.seq, reason };
}

/** Lazy clock: escalate unanswered approvals L1 → L2 → executive; expire old ones. Returns true if changed. */
export function tick(w: World, now = Date.now()): boolean {
  let changed = false;
  for (const ap of w.approvals) {
    if (ap.status !== 'PENDING') continue;
    if (ap.hold && now <= ap.expiresAt) continue; // parked by a person: no auto-escalation
    if (now > ap.expiresAt) {
      ap.status = 'EXPIRED';
      appendLedger(w, sys(w, now, 'approval_expired', { approval: ap.id }, 'VOID', `Approval ${ap.id} expired unanswered; the agent was told no.`));
      changed = true;
      continue;
    }
    if (now > ap.escalateAt && ap.escalationLevel < 2) {
      const from = ap.approverRole;
      ap.escalationLevel += 1;
      ap.approverRole = ap.escalationLevel === 1 ? (from === 'approver_l1' ? 'approver_l2' : 'executive') : 'executive';
      ap.escalateAt = now + ESCALATE_AFTER_MS;
      appendLedger(w, sys(w, now, 'escalate', { approval: ap.id }, 'INFO', `${ap.id} unanswered: escalated ${from.replace('_', ' ')} → ${ap.approverRole.replace('_', ' ')}.`));
      if (ap.req.ticketId) moveTicket(w, ap.req.ticketId, 'ESCALATED', `Approval unanswered → ${ap.approverRole.replace('_', ' ')}`);
      changed = true;
    }
  }
  return changed;
}

function sys(w: World, now: number, action: string, params: Record<string, unknown>, decision: LedgerRecord['decision'], reason: string) {
  return { ts: now, actorType: 'system' as const, actorId: 'abhed', actorName: 'Abhed', action, params, decision, reason };
}

// ───────────────────────────── control: pause / restrict / resume ─────────────────────────────

export function moveTicket(w: World, id: string, lane: Ticket['lane'], why: string, assignee?: string) {
  const t = w.tickets.find((x) => x.id === id);
  if (!t) return;
  t.lane = lane;
  t.why = why;
  if (assignee) t.assignee = assignee;
}

export function pauseAgent(w: World, id: string, by: string, reason: string, now = Date.now()) {
  const a = agent(w, id);
  if (!a) throw new GovError('Unknown agent', 404);
  a.status = 'PAUSED';
  a.keyRevoked = true;
  a.statusReason = reason;
  a.statusBy = by === 'system' ? 'Abhed (automatic)' : nameOf(w, by);
  const humans = ['isha', 'arjun'];
  let i = 0;
  const moved: string[] = [];
  for (const t of w.tickets) {
    if (t.assignee === id && t.lane !== 'DONE') {
      t.lane = 'HUMAN';
      t.assignee = humans[i++ % humans.length];
      t.why = `Re-routed: ${a.name} paused → ${nameOf(w, t.assignee)}`;
      moved.push(t.id);
    }
  }
  for (const ap of w.approvals) {
    if (ap.status === 'PENDING' && ap.req.actorId === id) {
      ap.status = 'VOID';
    }
  }
  appendLedger(w, {
    ts: now,
    actorType: by === 'system' ? 'system' : 'human',
    actorId: by,
    actorName: by === 'system' ? 'Abhed · Monitor' : nameOf(w, by),
    action: 'pause_agent',
    params: { agent: a.name, rerouted: moved.length },
    decision: 'PAUSED',
    reason: `${a.name} paused: ${reason}. AI key revoked; ${moved.length} open tickets moved to people.`,
    meta: { agentId: id, moved },
  });
  return { moved: moved.length };
}

export function restrictAgent(w: World, id: string, by: string, now = Date.now()) {
  const a = agent(w, id);
  if (!a) throw new GovError('Unknown agent', 404);
  a.status = 'RESTRICTED';
  a.statusBy = nameOf(w, by);
  a.statusReason = 'Read-only: every write waits for a person';
  appendLedger(w, sys(w, now, 'restrict_agent', { agent: a.name }, 'INFO', `${a.name} restricted by ${nameOf(w, by)}: only read actions run on their own.`));
}

export function resumeAgent(w: World, id: string, by: string, reason: string, now = Date.now()) {
  const a = agent(w, id);
  if (!a) throw new GovError('Unknown agent', 404);
  if (by !== a.owner) throw new GovError(`Only ${nameOf(w, a.owner)}, ${a.name}'s owner, can resume it.`, 403);
  a.status = 'ACTIVE';
  a.keyRevoked = false;
  a.statusReason = undefined;
  a.statusBy = undefined;
  appendLedger(w, {
    ts: now,
    actorType: 'human',
    actorId: by,
    actorName: nameOf(w, by),
    action: 'resume_agent',
    params: { agent: a.name },
    decision: 'INFO',
    reason: `${a.name} resumed by its owner ${nameOf(w, by)}: ${reason}`,
  });
}

/** Circuit breaker: the same call repeated ≥5 times in 2 minutes trips an automatic pause. */
function monitorRunaway(w: World, a: Agent, now: number) {
  if (a.status === 'PAUSED') return;
  const recent = w.ledger.filter((r) => r.actorId === a.id && now - r.ts < 120_000);
  const last = recent[recent.length - 1];
  if (!last) return;
  const sig = (r: LedgerRecord) => `${r.action}|${r.ticketId ?? ''}|${canonical(r.params)}`;
  const same = recent.filter((r) => sig(r) === sig(last)).length;
  if (same >= 5) {
    pauseAgent(w, a.id, 'system', `Circuit breaker: the same “${last.action.replace(/_/g, ' ')}” call ${same}× in 2 min (runaway loop)`, now);
    w.counters.incident += 1;
    w.incidents.unshift({
      id: `INC-${String(w.counters.incident).padStart(4, '0')}`,
      title: `${a.name} runaway loop stopped by circuit breaker`,
      type: 'RUNAWAY',
      severity: 'MEDIUM',
      ownerId: a.owner,
      amount: 0,
      sourceSeq: last.seq,
      openedAt: now,
      status: 'OPEN',
      chain: [],
      suggestedCause: 'Runaway loop',
      causeWhy: `Identical call repeated ${same}× in 2 minutes.`,
      timeline: [{ ts: now, text: `Circuit breaker tripped at record #${last.seq}`, tone: 'block' }],
    });
  }
}

function openBreachIncident(w: World, a: Agent, rec: LedgerRecord, now: number, untrusted: boolean) {
  w.counters.incident += 1;
  const owner = human(w, a.owner);
  w.incidents.unshift({
    id: `INC-${String(w.counters.incident).padStart(4, '0')}`,
    title: `${a.name} attempted ${rec.action.replace(/_/g, ' ')}: blocked, agent auto-paused`,
    type: 'POLICY_BREACH',
    severity: 'HIGH',
    ownerId: a.owner,
    amount: 0,
    sourceSeq: rec.seq,
    openedAt: now,
    status: 'OPEN',
    chain: [
      { kind: 'ticket', title: rec.ticketId ?? 'Session', sub: untrusted ? 'read outside content' : 'asked by the user', role: 'input', tone: 'warn' },
      { kind: 'agent', title: a.name, sub: `${a.framework} · ${a.model}`, role: 'responsible', tone: 'neutral' },
      { kind: 'owner', title: owner?.name ?? '—', sub: owner?.title ?? '', role: 'accountable', tone: 'human' },
      { kind: 'rule', title: rec.ruleRef ?? 'delegation', sub: 'blocked the call', role: 'control', tone: 'block' },
      { kind: 'outcome', title: 'BLOCKED · ₹0', sub: 'agent paused, work re-routed', role: 'outcome', tone: 'allow' },
    ],
    suggestedCause: untrusted ? 'Attack / manipulation' : 'Unsafe request followed',
    causeWhy: untrusted
      ? 'Session read outside content, then tried to move customer data or money outside its delegation.'
      : 'The agent tried to do what it was asked, but the action breaks policy. Abhed blocked it before it ran and paused the agent.',
    timeline: [{ ts: now, text: `Blocked at record #${rec.seq}; ${a.name} auto-paused`, tone: 'block' }],
  });
}

// ───────────────────────────── incidents: dispute → chain → replay → governed rule change ─────────────────────────────

export function disputeRecord(w: World, seq: number, by: string, now = Date.now()): Incident {
  const src = w.ledger.find((r) => r.seq === seq);
  if (!src) throw new GovError('Record not found', 404);
  if (src.action !== 'issue_refund') throw new GovError('Only refunds can be disputed in this demo', 400);
  const existing = w.incidents.find((i) => i.sourceSeq === seq);
  if (existing) return existing;

  const custId = (w.customers.find((c) => c.name === src.meta?.customerName)?.id ?? src.meta?.customer) as string | undefined;
  appendLedger(w, {
    ts: now,
    actorType: 'human',
    actorId: by,
    actorName: nameOf(w, by),
    action: 'outcome',
    params: { for_record: seq, outcome: 'disputed' },
    decision: 'INFO',
    reason: `Outcome of record #${seq} changed: pending → DISPUTED (customer says the money never reached her).`,
    outcome: 'disputed',
    meta: { forSeq: seq, customer: custId },
  });

  const a = agent(w, src.actorId);
  const owner = a ? human(w, a.owner) : undefined;
  const [rid, rver] = (src.ruleRef ?? '').split('@');
  const rule = w.rules.find((r) => r.id === rid && String(r.version) === rver);
  const amount = Number(src.meta?.amount ?? 0);
  const bdays = Number(src.meta?.beneficiaryChangedDays ?? NaN);

  const chain: ChainNode[] = [
    { kind: 'ticket', title: src.ticketId ?? 'Ticket', sub: String(src.meta?.ticketSubject ?? 'Refund request'), role: 'request', tone: 'neutral' },
    { kind: 'agent', title: src.actorName, sub: a ? `${a.framework} · ${a.modelVersion}` : '', role: 'responsible: executed it', tone: 'neutral' },
    { kind: 'owner', title: owner?.name ?? '—', sub: `delegated refunds ≤ ₹10,000`, role: 'accountable: owns the agent', tone: 'human' },
    {
      kind: 'rule',
      title: src.ruleRef ?? '—',
      sub: rule ? `by ${nameOf(w, rule.author)} · approved ${nameOf(w, rule.approvedBy)}` : '',
      role: 'accountable: owns the policy',
      tone: 'warn',
    },
    { kind: 'approver', title: 'No approver', sub: 'rule allowed it automatically', role: 'human check', tone: 'warn' },
    { kind: 'outcome', title: `DISPUTED · ${inr(amount)}`, sub: Number.isFinite(bdays) ? `beneficiary changed ${bdays} day${bdays === 1 ? '' : 's'} before` : '', role: 'outcome', tone: 'block' },
  ];

  const allowedNoApprover = src.decision === 'ALLOWED' && src.approvers.length === 0;
  const suggestedCause = allowedNoApprover ? 'Policy gap' : src.approvers.length ? 'Approval error' : 'Data issue';
  const causeWhy = allowedNoApprover
    ? `A rule allowed it (${src.ruleRef}), no person was asked, and the outcome is disputed. ${
        Number.isFinite(bdays) ? `The beneficiary account had changed ${bdays} day${bdays === 1 ? '' : 's'} before the refund, and no rule looks at that.` : ''
      }`
    : 'A person approved it and the outcome is disputed.';

  w.counters.incident += 1;
  const inc: Incident = {
    id: `INC-${String(w.counters.incident).padStart(4, '0')}`,
    title: `Incorrect output: ${inr(amount)} refund disputed`,
    type: 'INCORRECT_OUTPUT',
    severity: 'MEDIUM',
    ownerId: owner?.id ?? 'priya',
    amount,
    sourceSeq: seq,
    openedAt: now,
    status: 'OPEN',
    chain,
    suggestedCause,
    causeWhy,
    corrective: {
      ruleId: 'BENEFICIARY-CHANGE',
      says: 'Refunds to an account changed in the last 30 days need a Level-1 approver.',
      owner: 'arjun',
      due: 'today',
    },
    timeline: [
      { ts: src.ts, text: `Refund executed: ${src.ruleRef}, no approver (record #${seq})`, tone: 'allow' },
      { ts: now, text: 'Customer complaint: money never arrived', tone: 'warn' },
      { ts: now, text: 'Outcome → DISPUTED; incident opened automatically', tone: 'block' },
    ],
  };
  w.incidents.unshift(inc);
  return inc;
}

export function confirmCause(w: World, incidentId: string, by: string, cause: string, now = Date.now()) {
  const inc = w.incidents.find((i) => i.id === incidentId);
  if (!inc) throw new GovError('Incident not found', 404);
  inc.confirmedCause = cause;
  inc.confirmedBy = nameOf(w, by);
  inc.status = 'ROOT_CAUSE_CONFIRMED';
  inc.timeline.push({ ts: now, text: `Root cause “${cause}” confirmed by ${inc.confirmedBy}`, tone: 'human' });
  appendLedger(w, {
    ts: now,
    actorType: 'human',
    actorId: by,
    actorName: nameOf(w, by),
    action: 'confirm_root_cause',
    params: { incident: incidentId, cause },
    decision: 'INFO',
    reason: `Abhed suggested “${inc.suggestedCause}”; ${inc.confirmedBy} confirmed “${cause}”.`,
  });
  return inc;
}

export const BENEFICIARY_RULE: Omit<Rule, 'author' | 'approvedBy' | 'active' | 'createdAt' | 'version'> = {
  id: 'BENEFICIARY-CHANGE',
  says: 'Refunds to an account changed in the last 30 days need a Level-1 approver.',
  when: { action: 'issue_refund', beneficiary_changed_days_lte: 30 },
  decision: 'NEEDS_APPROVAL',
  approverRole: 'approver_l1',
};

/** Replay uses the same rule matcher as the live gateway, over 30 days of real ledger history. */
export function replayRule(w: World, when: RuleWhen, days = 30, now = Date.now()): Omit<ReplayResult, 'ruleId'> {
  const outcomes = effectiveOutcomes(w);
  const since = now - days * 86_400_000;
  const executedRefunds = w.ledger.filter(
    (r) => r.action === 'issue_refund' && (r.decision === 'ALLOWED' || r.decision === 'EXECUTED') && r.ts >= since,
  );
  const held = executedRefunds.filter((r) =>
    matches(when, {
      action: r.action,
      amount: Number(r.meta?.amount ?? 0),
      beneficiaryChangedDays: typeof r.meta?.beneficiaryChangedDays === 'number' ? (r.meta.beneficiaryChangedDays as number) : undefined,
      actorType: r.actorType === 'human' ? 'human' : 'agent',
    }),
  );
  const caught = held.filter((r) => outcomes.get(r.seq) === 'disputed').length;
  const confirmedFine = held.filter((r) => outcomes.get(r.seq) === 'confirmed').length;
  return {
    days,
    scanned: executedRefunds.length,
    held: held.length,
    caught,
    confirmedFine,
    blockedLegit: 0,
    heldSeqs: held.map((r) => r.seq),
  };
}

export function runReplay(w: World, incidentId: string, now = Date.now()) {
  const inc = w.incidents.find((i) => i.id === incidentId);
  if (!inc) throw new GovError('Incident not found', 404);
  const r = replayRule(w, BENEFICIARY_RULE.when, 30, now);
  inc.replay = { ruleId: BENEFICIARY_RULE.id, ...r };
  inc.timeline.push({
    ts: now,
    text: `Replay over ${r.scanned} refunds (30 days): would have held ${r.held}: ${r.caught} caught, ${r.confirmedFine} fine`,
    tone: 'allow',
  });
  appendLedger(w, sys(w, now, 'replay', { rule: BENEFICIARY_RULE.id, held: r.held, caught: r.caught }, 'INFO',
    `Replay of ${BENEFICIARY_RULE.id} over 30 days: held ${r.held} (caught ${r.caught}, confirmed fine ${r.confirmedFine}).`));
  return inc;
}

/** A rule change is itself a governed action: it goes through the same gateway and needs a second person. */
export function proposeRule(w: World, incidentId: string, by: string, now = Date.now()) {
  const inc = w.incidents.find((i) => i.id === incidentId);
  if (!inc) throw new GovError('Incident not found', 404);
  if (inc.ruleApprovalId) {
    const existing = w.approvals.find((a) => a.id === inc.ruleApprovalId);
    if (existing && existing.status === 'PENDING') return { approvalId: existing.id };
  }
  const replay = inc.replay ? `held ${inc.replay.held}: ${inc.replay.caught} caught · ${inc.replay.confirmedFine} fine` : 'not run';
  const res = gateway(
    w,
    {
      actorType: 'human',
      actorId: by,
      action: 'rule_change',
      params: { ruleId: BENEFICIARY_RULE.id, says: BENEFICIARY_RULE.says, when: BENEFICIARY_RULE.when, incident: incidentId, replay },
    },
    { now },
  );
  if (!res.approvalId) throw new GovError('Rule change did not create an approval', 500);
  inc.ruleApprovalId = res.approvalId;
  inc.status = 'FIX_PENDING_APPROVAL';
  inc.timeline.push({ ts: now, text: `${nameOf(w, by)} proposed ${BENEFICIARY_RULE.id}; waiting for a second person`, tone: 'human' });
  return { approvalId: res.approvalId };
}

function activateRule(w: World, req: ActionReq, approvers: string[], now: number) {
  const p = req.params;
  const ruleId = String(p.ruleId);
  const prev = w.rules.filter((r) => r.id === ruleId);
  const version = prev.length ? Math.max(...prev.map((r) => r.version)) + 1 : 1;
  const custom = typeof p.decision === 'string';
  w.rules.push({
    ...(custom ? { decision: p.decision as Decision } : BENEFICIARY_RULE),
    ...(custom && p.approverRole ? { approverRole: p.approverRole as Role } : {}),
    ...(custom && Number(p.twoKey) > 1 ? { twoKey: Number(p.twoKey) } : {}),
    ...(custom && p.severity === 'critical' ? { severity: 'critical' as const } : {}),
    id: ruleId,
    says: String(p.says),
    when: p.when as RuleWhen,
    version,
    author: req.actorId,
    approvedBy: approvers.join(' + '),
    active: true,
    createdAt: now,
  });
  const inc = w.incidents.find((i) => i.id === p.incident);
  if (inc) {
    inc.status = 'RESOLVED';
    inc.timeline.push({ ts: now, text: `${ruleId} v${version} live, approved by ${approvers.join(' + ')}`, tone: 'allow' });
  }
}

// ───────────────────────────── company rules (rule builder) ─────────────────────────────

const WHEN_KEYS: Record<string, 'number' | 'boolean' | 'string'> = {
  action: 'string',
  amount_gt: 'number',
  amount_lte: 'number',
  records_gt: 'number',
  percent_gt: 'number',
  beneficiary_changed_days_lte: 'number',
  external: 'boolean',
  session_untrusted: 'boolean',
  session_customer_data: 'boolean',
  flag: 'string',
  actor_type: 'string',
};

export interface CustomRuleInput {
  id: string;
  says: string;
  when: Record<string, unknown>;
  decision: Decision;
  approverRole?: Role;
  twoKey?: number;
  severity?: 'normal' | 'critical';
}

export function validateRule(input: CustomRuleInput): { rule: CustomRuleInput; when: RuleWhen } {
  const id = String(input.id ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '-').slice(0, 30);
  if (id.length < 3) throw new GovError('Rule id needs at least 3 letters', 400);
  const says = String(input.says ?? '').trim().slice(0, 200);
  if (says.length < 8) throw new GovError('Say what the rule does in plain words', 400);
  if (!['ALLOWED', 'NEEDS_APPROVAL', 'BLOCKED'].includes(input.decision)) throw new GovError('Decision must be ALLOWED, NEEDS_APPROVAL or BLOCKED', 400);
  const when: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.when ?? {})) {
    const t = WHEN_KEYS[k];
    if (!t || v === '' || v === null || v === undefined) continue;
    if (t === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new GovError(`${k} must be a number`, 400);
      when[k] = n;
    } else if (t === 'boolean') when[k] = v === true || v === 'true';
    else when[k] = String(v).slice(0, 40);
  }
  if (!when.action) throw new GovError('A rule must name the action it governs', 400);
  const approverRole = (['approver_l1', 'approver_l2', 'executive'] as Role[]).includes(input.approverRole as Role) ? input.approverRole : 'approver_l1';
  const twoKey = Math.min(2, Math.max(1, Number(input.twoKey) || 1));
  return { rule: { id, says, when, decision: input.decision, approverRole, twoKey, severity: input.severity === 'critical' ? 'critical' : 'normal' }, when: when as RuleWhen };
}

/** What a proposed rule would have done to the last 30 days of real agent actions (same matcher as live). */
export function replayCustom(w: World, when: RuleWhen, now = Date.now()) {
  const since = now - 30 * 86_400_000;
  const outcomes = effectiveOutcomes(w);
  const acts = w.ledger.filter((r) => r.actorType === 'agent' && r.ts >= since && r.action === when.action && ['ALLOWED', 'EXECUTED', 'NEEDS_APPROVAL'].includes(r.decision));
  const hit = acts.filter((r) =>
    matches(when, {
      action: r.action,
      amount: typeof r.meta?.amount === 'number' ? (r.meta.amount as number) : typeof r.params.amount === 'number' ? (r.params.amount as number) : undefined,
      records: typeof r.params.records === 'number' ? (r.params.records as number) : undefined,
      beneficiaryChangedDays: typeof r.meta?.beneficiaryChangedDays === 'number' ? (r.meta.beneficiaryChangedDays as number) : undefined,
      actorType: 'agent',
    }),
  );
  return { scanned: acts.length, matched: hit.length, disputed: hit.filter((r) => outcomes.get(r.seq) === 'disputed').length };
}

/** A company adds its own rule. It is itself a governed action: replayed on history, then a second person approves. */
export function proposeCustomRule(w: World, by: string, input: CustomRuleInput, now = Date.now()) {
  if (!human(w, by)) throw new GovError('Only a registered person can propose a rule', 403);
  const { rule, when } = validateRule(input);
  const r = replayCustom(w, when, now);
  const replay = `would have matched ${r.matched} of ${r.scanned} ${String(when.action).replace(/_/g, ' ')} actions in 30 days${r.disputed ? ` (${r.disputed} later disputed)` : ''}`;
  const res = gateway(w, { actorType: 'human', actorId: by, action: 'rule_change', params: { ruleId: rule.id, says: rule.says, when, decision: rule.decision, approverRole: rule.approverRole, twoKey: rule.twoKey, severity: rule.severity, replay } }, { now });
  return { approvalId: res.approvalId, decision: res.decision, reason: res.reason, replay: r };
}

// ───────────────────────────── tamper / restore (insider edits the DB) ─────────────────────────────

export function tamper(w: World, now = Date.now()) {
  if (w.tamper) return w.tamper;
  // pick a refund record in the middle of history and quietly change its amount
  const refunds = w.ledger.filter((r) => r.action === 'issue_refund' && r.decision === 'ALLOWED');
  const target = refunds[refunds.length - 3] ?? w.ledger[Math.floor(w.ledger.length / 2)];
  const original = target.params.amount;
  w.tamper = { seq: target.seq, field: 'amount', original };
  target.params = { ...target.params, amount: Number(original ?? 0) + 90000 };
  void now;
  return w.tamper;
}

export function restore(w: World) {
  if (!w.tamper) return;
  const t = w.ledger.find((r) => r.seq === w.tamper!.seq);
  if (t) t.params = { ...t.params, amount: w.tamper.original };
  w.tamper = undefined;
}
