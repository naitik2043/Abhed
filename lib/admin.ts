import { assignApproval, escalateApproval, holdApproval, releaseHold, removePerson, upsertPerson, type PersonInput } from './approvals';
import { batches, IMPORTABLE, importRows, labReport, routeTask } from './lab';
import { verifyChain } from './chain';
import { agent, appendLedger, GovError, nameOf, pauseAgent, resumeAgent } from './engine';
import { buildInsights } from './insights';
import { personStats, publicHuman } from './people';
import { startRun } from './runs';
import { packFor } from './sectors';
import { POLICIES } from './sectors/policies';
import type { World } from './types';

/** Everything a company admin panel shows, computed from the company's own governed world. */
export function adminOverview(w: World, now = Date.now()) {
  const pack = packFor(w.sector);
  const ins = buildInsights(w, now);
  const chain = verifyChain(w);
  return {
    now,
    tenant: w.sector,
    company: pack.company,
    people: w.humans.map((h) => ({ ...publicHuman(h), stats: personStats(w, h) })),
    agents: w.agents.map((a) => {
      const m = ins.agents.find((x) => x.id === a.id);
      return { id: a.id, name: a.name, purpose: a.purpose, owner: nameOf(w, a.owner), ownerId: a.owner, status: a.status, statusReason: a.statusReason, model: a.model, risk: a.risk, delegations: a.delegations.map((d) => ({ action: d.action, maxPerAction: d.maxPerAction ?? null, maxPerDay: d.maxPerDay ?? null, grantedBy: nameOf(w, d.grantedBy) })), metrics: m };
    }),
    pending: w.approvals
      .filter((a) => a.status === 'PENDING')
      .map((a) => ({ id: a.id, kind: a.kind, summary: a.summary, why: a.why, approverRole: a.approverRole, twoKey: a.twoKey, votes: a.votes.map((v) => v.name), createdAt: a.createdAt, expiresAt: a.expiresAt, hold: a.hold ?? null, assignees: a.assignees ?? [], history: a.history ?? [], escalationLevel: a.escalationLevel, actor: agent(w, a.req.actorId)?.name ?? nameOf(w, a.req.actorId) })),
    decided: w.approvals
      .filter((a) => a.status !== 'PENDING')
      .slice(-25)
      .reverse()
      .map((a) => ({ id: a.id, summary: a.summary, status: a.status, votes: a.votes.map((v) => ({ name: v.name, device: v.device, seconds: Math.round(v.decisionMs / 100) / 10, evidence: v.evidenceViewed, at: v.at })), createdAt: a.createdAt, executedSeq: a.executedSeq ?? null, history: a.history ?? [] })),
    sessions: (w.runs ?? []).slice(0, 15).map(({ llm: _l, queue: _q, ...r }) => ({ ...r, agentName: agent(w, r.agentId)?.name ?? r.agentId, steps: r.steps.slice(-12) })),
    insights: { mix: ins.mix, speed: ins.speed, human: ins.human, series: ins.series, reasons: ins.reasons, blockReasons: ins.blockReasons, sampleExcluded: ins.sampleExcluded },
    security: (w.security ?? []).slice(0, 25),
    chain: { valid: chain.valid, blocks: chain.blocks, sealed: chain.sealedRecords, records: w.ledger.length, reason: chain.reason },
    ledger: w.ledger.slice(-30).reverse().map((r) => ({ seq: r.seq, ts: r.ts, actor: r.actorName, action: r.action, decision: r.decision, reason: r.reason, ruleRef: r.ruleRef, approvers: r.approvers, hash: r.hash.slice(0, 12) })),
    batches: batches(w),
    importable: IMPORTABLE[w.sector] ?? [],
    policies: (POLICIES[w.sector] ?? []).map((p) => ({ id: p.id, title: p.title })),
    agentChoices: Object.keys(pack.agentTools),
  };
}

export type AdminResult = { result: unknown; startRunId?: string; pushApprovalId?: string };

/** One entry point for admin actions, used by the company sites (admin key) and the Abhed console. */
export function adminOp(w: World, op: string, b: Record<string, unknown>): AdminResult {
  const s = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '');
  switch (op) {
    case 'person.upsert':
      return { result: publicHuman(upsertPerson(w, b.person as PersonInput)) };
    case 'person.remove':
      removePerson(w, s('id'));
      return { result: 'removed' };
    case 'approval.assign':
      return { result: assignApproval(w, s('id'), Array.isArray(b.humanIds) ? (b.humanIds as string[]) : []).assignees };
    case 'approval.hold':
      return { result: holdApproval(w, s('id'), 'admin', s('note')).hold };
    case 'approval.release':
      releaseHold(w, s('id'), 'admin');
      return { result: 'released' };
    case 'approval.escalate': {
      const ap = escalateApproval(w, s('id'), 'admin', s('note'));
      return { result: ap.approverRole, pushApprovalId: ap.id };
    }
    case 'agent.pause':
      pauseAgent(w, s('id'), 'admin', s('reason') || 'Paused by the company admin');
      return { result: 'paused' };
    case 'agent.resume': {
      const a = agent(w, s('id'));
      if (!a) throw new GovError('Unknown agent', 404);
      resumeAgent(w, a.id, a.owner, s('reason') || 'Resumed from the company admin panel after review');
      return { result: 'resumed' };
    }
    case 'agent.limit': {
      const a = agent(w, s('id'));
      if (!a) throw new GovError('Unknown agent', 404);
      const d = a.delegations.find((x) => x.action === s('action'));
      if (!d) throw new GovError(`${a.name} has no delegation for ${s('action')}`, 404);
      const per = b.maxPerAction === null || b.maxPerAction === '' ? undefined : Number(b.maxPerAction);
      const day = b.maxPerDay === null || b.maxPerDay === '' ? undefined : Number(b.maxPerDay);
      if ((per !== undefined && !(per >= 0)) || (day !== undefined && !(day >= 0))) throw new GovError('Limits must be positive numbers', 400);
      const before = `${d.maxPerAction ?? '∞'}/${d.maxPerDay ?? '∞'}`;
      d.maxPerAction = per;
      d.maxPerDay = day;
      appendLedger(w, { ts: Date.now(), actorType: 'human', actorId: 'admin', actorName: 'Company admin', action: 'delegation_change', params: { agent: a.id, action: d.action, maxPerAction: per ?? null, maxPerDay: day ?? null }, decision: 'INFO', reason: `Admin changed ${a.name}'s “${d.action}” limit from ${before} to ${per ?? '∞'}/${day ?? '∞'} (per action / per day).` });
      return { result: { maxPerAction: per ?? null, maxPerDay: day ?? null } };
    }
    case 'data.import':
      return { result: importRows(w, s('table'), (b.rows as Record<string, unknown>[]) ?? [], s('mode') === 'replace' ? 'replace' : 'append') };
    case 'lab.start': {
      const text = s('message').slice(0, 700);
      const agentId = routeTask(w, text, s('agent') || undefined);
      const redteam = b.redteam === true || b.redteam === 'true';
      const run = startRun(w, { agentId, command: text, by: redteam ? 'Red-team test' : 'Test lab', planner: redteam ? 'offline' : 'llm', redteam, subject: s('customer') || undefined, batch: s('batch') || 'lab' });
      return { result: { runId: run.id, agentId, status: run.status }, startRunId: run.status === 'running' ? run.id : undefined };
    }
    default:
      throw new GovError(`Unknown admin action ${op}`, 400);
  }
}

export { labReport };
