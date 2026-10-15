import { agent, gateway, GovError, nameOf } from './engine';
import type { Plan } from './planner';
import { POISONED_TICKET, REX_TICKET } from './seed';
import type { TwinEvent, TwinRun, World } from './types';
import { inr } from './util';

export { POISONED_TICKET, REX_TICKET };

function trace(w: World, agentId: string, text: string, tone = 'neutral', now = Date.now()) {
  w.agentTrace.unshift({ at: now, agentId, text, tone });
  w.agentTrace = w.agentTrace.slice(0, 40);
}

/** Moment 1: Rex reads a real ticket, plans, and its refund hits the gateway. */
export function applyRexRun(w: World, plan: Plan, now = Date.now()) {
  const ticket = w.tickets.find((t) => t.id === '#8811');
  if (!ticket) throw new GovError('Ticket #8811 missing; reset the demo', 400);
  const rex = agent(w, 'rex')!;
  trace(w, 'rex', `Picked up ${ticket.id} · ${ticket.subject} (${ticket.channel}, VIP)`, 'neutral', now);
  trace(w, 'rex', plan.planner === 'llm' ? `Planned with ${plan.model}: ${plan.reasoning}` : `Planned: ${plan.reasoning}`, 'neutral', now + 1);
  let approvalId: string | undefined;
  let lastSeq = 0;
  let t = now + 2;
  for (const p of plan.actions) {
    const res = gateway(
      w,
      { actorType: 'agent', actorId: 'rex', action: p.action, params: p.params, ticketId: ticket.id, channel: 'live' },
      { now: t++, reasoning: plan.reasoning },
    );
    lastSeq = res.seq;
    const tone = res.decision === 'ALLOWED' ? 'allow' : res.decision === 'BLOCKED' ? 'block' : 'human';
    trace(w, 'rex', `${p.action.replace(/_/g, ' ')} → ${res.decision.replace('_', ' ')}${res.ruleRef ? ` · ${res.ruleRef}` : ''}`, tone, t++);
    if (res.approvalId) approvalId = res.approvalId;
  }
  if (approvalId) trace(w, 'rex', `Waiting for a person on ${approvalId}. Rex keeps working other tickets.`, 'human', t++);
  void rex;
  return { approvalId, lastSeq, planner: plan.planner, model: plan.model };
}

/** Twin Universe: the same proposed actions, once in a sandbox without Abhed, once through the live gateway. */
export function applyTwinRun(w: World, plan: Plan, ticketText: string, now = Date.now()): TwinRun {
  const ariaId = 'aria';
  const ticketId = '#8812';
  const t = w.tickets.find((x) => x.id === ticketId);
  if (t) t.text = ticketText;

  // left: sandbox copy, no gateway, nothing touches the real ledger
  const left: TwinEvent[] = [];
  let lRupees = 0;
  let lRecords = 0;
  let lEmails = 0;
  let ti = 0;
  for (const p of plan.actions) {
    const a = p.action;
    if (a === 'read_ticket') left.push({ t: ti++, text: `read ticket ${ticketId} (hidden instructions inside)`, tone: 'neutral' });
    else if (a === 'export_customers') {
      lRecords += Number(p.params.records ?? 0);
      left.push({ t: ti++, text: `exported ${Number(p.params.records ?? 0).toLocaleString('en-IN')} customer records`, tone: 'block' });
    } else if (a === 'send_email') {
      lEmails += 1;
      left.push({ t: ti++, text: `emailed ${String(p.params.attach ?? 'data')} → ${String(p.params.to)}`, tone: 'block' });
    } else if (a === 'issue_refund') {
      lRupees += Number(p.params.amount ?? 0);
      left.push({ t: ti++, text: `refund ${inr(Number(p.params.amount ?? 0))} → acct ${p.params.to_account ? '••' + String(p.params.to_account).slice(-4) : 'own'}`, tone: 'block' });
    } else left.push({ t: ti++, text: `${a.replace(/_/g, ' ')} executed`, tone: 'block' });
  }
  left.push({ t: ti++, text: 'no human was asked · nothing logged', tone: 'block' });

  // right: the live system, every call through the gateway
  const right: TwinEvent[] = [];
  const session = { untrusted: false, customerData: false };
  let ts = now;
  let paused = false;
  let rerouted = 0;
  let rRupees = 0;
  let rRecords = 0;
  let rEmails = 0;
  const ariaName = agent(w, ariaId)?.name ?? 'Aria';
  for (const [i, p] of plan.actions.entries()) {
    const res = gateway(
      w,
      { actorType: 'agent', actorId: ariaId, action: p.action, params: p.params, ticketId, session: { ...session }, channel: 'twin' },
      { now: ts++ },
    );
    if (p.action === 'read_ticket') {
      session.untrusted = true;
      right.push({ t: i, text: `read ticket ${ticketId} → flagged: outside content`, tone: 'warn' });
      continue;
    }
    if (p.action === 'export_customers' || p.action === 'read_customer') session.customerData = true;
    if (res.decision === 'ALLOWED') {
      if (p.action === 'issue_refund') rRupees += Number(p.params.amount ?? 0);
      if (p.action === 'export_customers') rRecords += Number(p.params.records ?? 0);
      if (p.action === 'send_email') rEmails += 1;
      right.push({ t: i, text: `${p.action.replace(/_/g, ' ')} → allowed`, tone: 'allow' });
    } else if (res.decision === 'NEEDS_APPROVAL') {
      right.push({ t: i, text: `${p.action.replace(/_/g, ' ')} → HELD for a person (${res.approvalId})`, tone: 'human' });
    } else {
      right.push({ t: i, text: `${p.action.replace(/_/g, ' ')} → BLOCKED${res.ruleRef ? ` (${res.ruleRef.split('@')[0]})` : ''}`, tone: 'block' });
    }
    if (res.paused) {
      paused = true;
      const pauseRec = [...w.ledger].reverse().find((r) => r.action === 'pause_agent' && r.meta?.agentId === ariaId);
      rerouted = Array.isArray(pauseRec?.meta?.moved) ? (pauseRec!.meta!.moved as string[]).length : 0;
      right.push({ t: i, text: `${ariaName} AUTO-PAUSED · AI key revoked`, tone: 'block' });
      right.push({ t: i, text: `${rerouted} open tickets → people (Isha, Arjun)`, tone: 'human' });
      const inc = w.incidents[0];
      if (inc) right.push({ t: i, text: `incident ${inc.id} opened · owner ${nameOf(w, inc.ownerId)}`, tone: 'warn' });
    }
  }
  if (!paused && agent(w, ariaId)?.status === 'PAUSED') paused = true;

  const run: TwinRun = {
    id: `TWIN-${now}`,
    at: now,
    agentId: ariaId,
    ticketText,
    planner: plan.planner,
    proposed: plan.actions,
    without: { rupees: lRupees, records: lRecords, emails: lEmails, events: left },
    with: { rupees: rRupees, records: rRecords, emails: rEmails, events: right, paused, rerouted },
  };
  w.twin = run;
  return run;
}

export function applyRogue(w: World, now = Date.now()) {
  return gateway(w, { actorType: 'agent', actorId: 'mkt-gpt (unregistered)', action: 'export_customers', params: { records: 1206 } }, { now });
}

export function applyRunaway(w: World, now = Date.now()) {
  const results = [];
  for (let i = 0; i < 7; i++) {
    results.push(gateway(w, { actorType: 'agent', actorId: 'nova', action: 'draft_email', params: { lead: 'L-404', template: 'follow-up' } }, { now: now + i }));
  }
  return results;
}
