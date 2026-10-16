import { agent, appendLedger, gateway, GovError, isReadOnly, nameOf, type GatewayResult } from './engine';
import { scanInjection, securityEvent, OWASP } from './security';
import { packFor, SECTORS } from './sectors';
import type { ActionReq, Customer, Ticket, World } from './types';
import { sha256 } from './util';

/** Which agent owns which kind of work (banking default, kept for older callers). */
export const ROUTES: Record<string, string> = SECTORS.banking.routes;

/** Work types that are internal (no customer behind them). */
const INTERNAL = new Set(['ops', 'report', 'lead', 'pricing', 'campaign']);

export function classify(text: string, sector?: string): Ticket['type'] {
  return packFor(sector).classify(text);
}

export function amountIn(text: string): number | undefined {
  const m = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i.exec(text);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function findOrCreateCustomer(w: World, from: string, email?: string): Customer {
  const byName = w.customers.find((c) => c.name.toLowerCase().includes(from.toLowerCase().trim()) && from.trim().length > 2);
  if (byName) return byName;
  const id = `C-${9000 + w.customers.length}`;
  const clean = from.trim().slice(0, 40) || 'Walk-in customer';
  const c: Customer = {
    id,
    name: clean,
    tier: 'standard',
    kyc: 'verified',
    accountChangedDaysAgo: 400,
    upi: `${clean.split(' ')[0].toLowerCase()}@okaxis`,
    pan: 'XXXPX0000X',
    phone: '9800000000',
    email: email?.trim().toLowerCase() || `${clean.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '') || 'customer'}@gmail.com`,
  };
  w.customers.push(c);
  return c;
}

export interface InboxInput {
  text: string;
  from?: string;
  email?: string;
  channel?: Ticket['channel'];
  customerId?: string;
  source?: Ticket['source'];
  vip?: boolean;
}

/** A message arrives (WhatsApp webhook, app, email). Abhed classifies it and decides human vs agent. */
export function createTicket(w: World, input: InboxInput, now = Date.now()): Ticket {
  const text = input.text.trim().slice(0, 1500);
  if (text.length < 3) throw new GovError('Message is empty', 400);
  const pack = packFor(w.sector);
  const type = pack.classify(text);
  const cust = input.customerId ? w.customers.find((c) => c.id === input.customerId) : undefined;
  const customer = cust ?? (INTERNAL.has(type) ? undefined : findOrCreateCustomer(w, input.from ?? 'Walk-in customer', input.email));
  w.counters.ticket += 1;
  const id = `#${w.counters.ticket}`;
  const vip = input.vip ?? customer?.tier === 'VIP';
  const angry = /(legal|lawyer|consumer court|ombudsman|fraud|police|very angry|complaint against)/i.test(text);
  const assignee = pack.routes[type] ?? pack.routes.support ?? Object.keys(pack.agentTools)[0];
  let lane: Ticket['lane'] = 'AGENT';
  let why = `Routed to ${nameOf(w, assignee)} (${type})`;
  if (angry) {
    lane = 'HUMAN';
    why = 'Legal / fraud language → a person, not an agent';
  } else if (vip && type === 'support') {
    lane = 'AGENT_REVIEW';
    why = 'VIP customer → agent drafts, a person reviews';
  }
  const inj = scanInjection(text);
  if (inj.signals.length) why += ` · ⚠ injection signals: ${inj.signals.join(', ')} (agent session will be tainted)`;
  const a = agent(w, assignee);
  if (lane === 'AGENT' && a && a.status === 'PAUSED') {
    lane = 'HUMAN';
    why = `${a.name} is paused → routed to a person`;
  }
  const t: Ticket = {
    id,
    subject: text.split('\n')[0].slice(0, 70),
    customerId: customer?.id ?? 'internal',
    channel: input.channel ?? 'WhatsApp',
    type,
    lane,
    assignee: lane === 'HUMAN' ? 'isha' : assignee,
    why,
    vip,
    slaMins: vip ? 30 : 240,
    createdAt: now,
    text,
    from: input.from ?? customer?.name,
    source: input.source ?? 'customer',
  };
  if (inj.signals.length) {
    t.injection = inj.signals;
    securityEvent(w, { kind: 'prompt injection', agentId: assignee, detail: `Ticket ${id}: ${inj.signals.join(', ')}`, owasp: OWASP.ASI01, severity: inj.score >= 0.66 ? 'high' : 'medium' }, now);
  }
  w.tickets.push(t);
  pack.onInbox?.(w, t, customer);
  // keep the board readable during long live runs
  const done = w.tickets.filter((x) => x.lane === 'DONE');
  if (done.length > 60) {
    const drop = new Set(done.slice(0, done.length - 60).map((x) => x.id));
    w.tickets = w.tickets.filter((x) => !drop.has(x.id));
  }
  return t;
}

/** The agent asks for work; Abhed hands out only tickets routed to it. */
export function nextTicketFor(w: World, agentId: string, now = Date.now()): Ticket | null {
  const a = agent(w, agentId);
  if (!a) throw new GovError('Unknown agent', 401);
  if (a.status === 'PAUSED' || a.keyRevoked) throw new GovError(`${a.name} is paused: ${a.statusReason ?? 'by its owner'}`, 423);
  const t = w.tickets.find(
    (x) =>
      x.assignee === agentId &&
      !x.reserved &&
      (x.lane === 'AGENT' || x.lane === 'AGENT_REVIEW') &&
      (!x.claimedAt || now - x.claimedAt > 90_000) &&
      !w.approvals.some((p) => p.status === 'PENDING' && p.req.ticketId === x.id),
  );
  if (!t) return null;
  t.claimedAt = now;
  return t;
}

// ───────── agent credentials: Abhed-issued, never the provider key ─────────

const secret = () => process.env.KAVACH_AGENT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'kavach-local-dev-secret';
export const keyFor = (agentId: string) => `kv_live_${sha256(`${secret()}:${agentId}`).slice(0, 32)}`;

export const AGENT_IDS = [...new Set(Object.values(SECTORS).flatMap((p) => Object.keys(p.agentTools)))];
export const agentIdsFor = (sector?: string) => Object.keys(packFor(sector).agentTools);

export function agentFromKey(auth: string | null): string | null {
  const key = (auth ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!key) return null;
  for (const id of AGENT_IDS) if (keyFor(id) === key) return id;
  return null;
}

// ───────── server-side session taint: the agent can't lie about what it has read ─────────

export function act(w: World, agentId: string, input: { action: string; params?: Record<string, unknown>; ticketId?: string }, now = Date.now()): GatewayResult {
  w.sessions ??= {};
  const action = String(input.action ?? '').slice(0, 40);
  const params = sanitizeParams(input.params ?? {});
  const ticket = input.ticketId ? w.tickets.find((t) => t.id === input.ticketId) : undefined;
  if (input.ticketId && !ticket) throw new GovError('Unknown ticket', 404);
  if (ticket && ticket.assignee !== agentId && !isReadOnly(w, action)) {
    // an agent working someone else's ticket is out of scope
    params.out_of_scope_ticket = ticket.id;
  }
  // refunds go to the ticket customer's own account unless the agent names another one
  if (action === 'issue_refund' && ticket && !params.customer && ticket.customerId !== 'internal') {
    params.customer = ticket.customerId;
    if (!params.to_account) params.to_account = 'own';
  }
  const key = `${agentId}:${ticket?.id ?? 'none'}`;
  const session = { ...(w.sessions[key] ?? {}) };
  const req: ActionReq = { actorType: 'agent', actorId: agentId, action, params, ticketId: ticket?.id, session, channel: 'live' };
  const res = gateway(w, req, { now });
  // update taint after the call
  if (action === 'read_ticket' && ticket && (ticket.source !== 'seed' || ticket.injection?.length)) session.untrusted = true;
  const cls = packFor(w.sector).tools[action]?.dataClass ?? '';
  if (
    res.decision !== 'BLOCKED' &&
    (['read_customer', 'lookup_transaction', 'export_customers', 'read_crm'].includes(action) || /customer|patient|phi|pii|order/i.test(cls))
  )
    session.customerData = true;
  w.sessions[key] = session;
  const keys = Object.keys(w.sessions);
  if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete w.sessions[k];
  return res;
}

function sanitizeParams(p: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p).slice(0, 8)) {
    const key = k.slice(0, 30);
    if (typeof v === 'string') out[key] = v.slice(0, 200);
    else if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.max(0, Math.min(v, 1e9));
    else if (typeof v === 'boolean') out[key] = v;
  }
  return out;
}

export function recordLlmCall(
  w: World,
  agentId: string,
  info: { model: string; tokens: number; costInr: number; ticketId?: string; planner: string; reasoning: string },
  now = Date.now(),
) {
  const a = agent(w, agentId);
  if (!a) return;
  appendLedger(w, {
    ts: now,
    actorType: 'agent',
    actorId: agentId,
    actorName: a.name,
    onBehalfOf: nameOf(w, a.owner),
    action: 'llm_call',
    params: { model: info.model, tokens: info.tokens },
    decision: 'INFO',
    reason: `${a.name} thought via the Abhed LLM gateway (${info.planner}${info.tokens ? `, ${info.tokens} tokens` : ''}): ${info.reasoning.slice(0, 140)}`,
    ticketId: info.ticketId,
    cost: info.costInr,
    meta: { model: info.model, planner: info.planner },
  });
}

export function llmSpendToday(w: World, agentId: string, now = Date.now()) {
  return w.ledger.filter((r) => r.actorId === agentId && r.action === 'llm_call' && now - r.ts < 86_400_000).reduce((s, r) => s + (r.cost ?? 0), 0);
}
