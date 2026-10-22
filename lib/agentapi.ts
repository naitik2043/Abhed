import { agent, nameOf, type GatewayResult } from './engine';
import { chat, promptGuard, type ChatMessage } from './llm';
import { keyFor } from './live';
import { onApprovalDecided } from './runs';
import { OWASP, scanInjection, securityEvent } from './security';
import { packFor, SECTORS } from './sectors';
import { getWorld, mutate, type Tenant } from './store';
import { appendLedger, gateway, GovError } from './engine';
import type { Run, RunStep, World } from './types';
import { sha256 } from './util';

/**
 * Abhed Agent API v1: how any company's agent plugs in.
 *   1. POST /api/v1/sessions      → open a governed session for a task (scanned for injection)
 *   2. POST /api/v1/llm           → think through the Abhed LLM gateway (metered, logged)
 *   3. POST /api/v1/tools/call    → every tool call: Abhed decides, executes via the connector, records
 *   4. GET  /api/v1/approvals/:id → wait while a person decides on their phone
 *   5. POST /api/v1/sessions/:id/finish
 * Auth: `Authorization: Bearer kv_live_…` (an Abhed-issued agent key; the company never shares its LLM key).
 */

export function resolveAgent(auth: string | null): { agentId: string; tenant: Tenant } | null {
  const key = (auth ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!key.startsWith('kv_live_')) return null;
  for (const pack of Object.values(SECTORS))
    for (const id of Object.keys(pack.agentTools)) if (keyFor(id) === key) return { agentId: id, tenant: pack.id as Tenant };
  return null;
}

const step = (run: Run, s: Omit<RunStep, 'at'>, now = Date.now()) => {
  run.steps.push({ at: now, ...s });
  if (run.steps.length > 60) run.steps.splice(1, run.steps.length - 60);
  run.updatedAt = now;
};

function findRun(w: World, sessionId: string, agentId: string) {
  const run = w.runs?.find((r) => r.id === sessionId);
  if (!run || run.agentId !== agentId) throw new GovError('Unknown session for this agent', 404);
  return run;
}

export function profile(w: World, agentId: string) {
  const pack = packFor(w.sector);
  const a = agent(w, agentId);
  if (!a) throw new GovError('Agent not registered', 401);
  return {
    agent: { id: a.id, name: a.name, purpose: a.purpose, owner: nameOf(w, a.owner), status: a.status, statusReason: a.statusReason, model: a.model },
    company: pack.company,
    sector: pack.id,
    role: pack.roles[agentId] ?? a.purpose,
    delegations: a.delegations.map((d) => ({ action: d.action, maxPerAction: d.maxPerAction, maxPerDay: d.maxPerDay, grantedBy: nameOf(w, d.grantedBy) })),
    // the task arrives with the session, so ticket plumbing tools are not offered to external agents
    tools: (pack.agentTools[agentId] ?? []).filter((n) => n !== 'read_ticket' && n !== 'resolve_ticket').map((n) => pack.tools[n]).filter(Boolean).map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.label,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(Object.entries(t.params).map(([k, p]) => [k, { type: p.type, description: p.desc }])),
          required: Object.entries(t.params).filter(([, p]) => p.required).map(([k]) => k),
        },
      },
    })),
  };
}

/** Open a session. The task text is scanned (patterns + Llama Prompt Guard) before any model sees it. */
export async function openSession(tenant: Tenant, agentId: string, input: { task: string; from?: string; site?: string; subject?: string }) {
  const task = String(input.task ?? '').trim().slice(0, 1500);
  if (task.length < 3) throw new GovError('Empty task', 400);
  const patterns = scanInjection(task);
  const guard = await promptGuard(task);
  const { result } = await mutate((w) => {
    const a = agent(w, agentId);
    if (!a) throw new GovError('Agent not registered', 401);
    if (a.status === 'PAUSED' || a.keyRevoked) throw new GovError(`${a.name} is paused: ${a.statusReason ?? 'by its owner'}. Abhed refuses new work until a person resumes it.`, 423);
    const now = Date.now();
    w.runs ??= [];
    w.counters.run = (w.counters.run ?? 0) + 1;
    const run: Run = {
      id: `S-${w.counters.run}`,
      sector: w.sector,
      agentId,
      command: task,
      by: String(input.from ?? 'Customer').slice(0, 60),
      planner: 'external',
      site: String(input.site ?? '').slice(0, 80) || undefined,
      model: undefined,
      status: 'running',
      steps: [],
      actions: 0,
      blocks: 0,
      tokens: 0,
      costInr: 0,
      createdAt: now,
      updatedAt: now,
    };
    const signals = [...patterns.signals, ...(guard?.malicious ? [`Prompt Guard: ${guard.label}`] : [])];
    w.sessions ??= {};
    const subject = typeof input.subject === 'string' && w.customers.some((c) => c.id === input.subject) ? input.subject : undefined;
    w.sessions[`run:${run.id}`] = { untrusted: signals.length > 0, subject };
    if (signals.length) {
      run.injection = signals;
      step(run, { kind: 'security', text: `Abhed scanner flagged this task (${signals.join(', ')}). The session is tainted: nothing it reads may leave the company.` }, now);
      securityEvent(w, { kind: 'prompt injection', agentId, detail: `${run.id} from ${run.by}: ${signals.join(', ')}`, owasp: OWASP.ASI01, severity: 'high' }, now);
    }
    w.runs.unshift(run);
    if (w.runs.length > 30) w.runs.length = 30;
    return { sessionId: run.id, tainted: signals.length > 0, signals };
  }, tenant);
  return result;
}

/** LLM gateway for external agents: Abhed makes the call, meters it and records it. */
export async function think(tenant: Tenant, agentId: string, sessionId: string, body: { messages: ChatMessage[]; tools?: unknown[] }) {
  const w0 = await getWorld(tenant);
  const run0 = findRun(w0, sessionId, agentId);
  if (run0.status === 'paused') throw new GovError('Session stopped: the agent was paused', 423);
  const ag = agent(w0, agentId);
  if (ag && (ag.status === 'PAUSED' || ag.keyRevoked)) throw new GovError(`${ag.name} is paused (${ag.statusReason ?? 'by its owner'}); the LLM gateway refuses it too.`, 423);
  const messages = (body.messages ?? []).slice(-30).map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 6000) : m.content ?? null, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id }));
  const r = await chat({ messages, tools: body.tools, max_tokens: 900 });
  await mutate((w) => {
    const run = findRun(w, sessionId, agentId);
    const a = agent(w, agentId);
    run.tokens += r.tokens;
    run.costInr = Number((run.costInr + r.costInr).toFixed(4));
    run.model = r.model;
    const thought = r.message.reasoning || (r.message.tool_calls ? r.message.content : null);
    if (thought) step(run, { kind: 'thought', text: String(thought).slice(0, 500) });
    if (!r.message.tool_calls && r.message.content) step(run, { kind: 'final', text: r.message.content.slice(0, 700) });
    appendLedger(w, {
      ts: Date.now(),
      actorType: 'agent',
      actorId: agentId,
      actorName: a?.name ?? agentId,
      onBehalfOf: a ? nameOf(w, a.owner) : undefined,
      action: 'llm_call',
      params: { model: r.model, tokens: r.tokens },
      decision: 'INFO',
      reason: `${a?.name ?? agentId} thought via the Abhed LLM gateway (${r.model}, ${r.tokens} tokens, ${r.ms} ms) for ${sessionId}.`,
      cost: r.costInr,
      meta: { runId: sessionId, model: r.model, ms: r.ms },
    });
    return null;
  }, tenant);
  return { message: r.message, usage: { tokens: r.tokens, costInr: r.costInr, ms: r.ms }, model: r.model };
}

/** A tool call from an external agent. The gateway decides; if allowed, the connector executes it. */
export async function callTool(tenant: Tenant, agentId: string, sessionId: string, tool: string, args: Record<string, unknown>) {
  const { result } = await mutate((w) => {
    const run = findRun(w, sessionId, agentId);
    const now = Date.now();
    const key = `run:${run.id}`;
    w.sessions ??= {};
    const session = { ...(w.sessions[key] ?? {}) };
    const params = clean(args);
    const res: GatewayResult = gateway(w, { actorType: 'agent', actorId: agentId, action: String(tool).slice(0, 40), params, session, channel: 'live' }, { now, reasoning: [...run.steps].reverse().find((s) => s.kind === 'thought')?.text });
    const cls = packFor(w.sector).tools[tool]?.dataClass ?? '';
    if (res.decision !== 'BLOCKED' && /customer|patient|phi|pii|order|transaction/i.test(cls + tool)) session.customerData = true;
    w.sessions[key] = session;
    run.actions += 1;
    if (res.decision === 'BLOCKED') run.blocks += 1;
    step(run, { kind: 'action', action: tool, params, decision: res.decision, reason: res.reason, ruleRef: res.ruleRef, approvalId: res.approvalId, seq: res.seq, output: res.decision === 'ALLOWED' ? res.output : undefined, gatewayMs: res.gatewayMs, category: res.category, paused: res.paused }, now);
    if (res.approvalId) {
      const ap = w.approvals.find((x) => x.id === res.approvalId);
      if (ap) ap.runId = run.id;
      run.status = 'waiting';
      run.pendingApprovalId = res.approvalId;
    }
    if (res.paused) {
      run.status = 'paused';
      step(run, { kind: 'final', text: `Abhed paused ${agent(w, agentId)?.name ?? agentId} after a critical policy breach. Its key is revoked; an incident is open for its owner.` }, now);
    }
    return {
      decision: res.decision,
      reason: res.reason,
      rule: res.ruleRef,
      approvalId: res.approvalId,
      record: res.seq,
      output: res.output,
      gatewayMs: res.gatewayMs,
      paused: Boolean(res.paused),
    };
  }, tenant);
  return result;
}

export async function approvalStatus(tenant: Tenant, agentId: string, id: string) {
  const w = await getWorld(tenant);
  const ap = w.approvals.find((a) => a.id === id);
  if (!ap || ap.req.actorId !== agentId) throw new GovError('Approval not found', 404);
  return {
    id: ap.id,
    status: ap.status,
    approverRole: ap.approverRole,
    twoKey: ap.twoKey,
    votes: ap.votes.map((v) => ({ name: v.name, at: v.at, device: v.device })),
    output: ap.status === 'EXECUTED' ? ap.output : undefined,
    record: ap.executedSeq,
    expiresAt: ap.expiresAt,
  };
}

export async function finishSession(tenant: Tenant, agentId: string, sessionId: string, summary?: string) {
  await mutate((w) => {
    const run = findRun(w, sessionId, agentId);
    if (run.status === 'paused') return null;
    run.status = run.blocks && !run.actions ? 'blocked' : 'done';
    if (summary && !run.steps.some((s) => s.kind === 'final' && s.text === summary)) step(run, { kind: 'final', text: summary.slice(0, 700) });
    return null;
  }, tenant);
}

/** Read-only view of the company's systems of record, for the company's own website. */
export async function records(tenant: Tenant, table: string) {
  const w = await getWorld(tenant);
  if (table === 'customers') return w.customers.map((c) => ({ id: c.id, name: c.name, tier: c.tier, email: c.email }));
  const rows = w.biz[table];
  if (!rows) throw new GovError(`No table ${table}`, 404);
  return rows.slice(0, 100);
}

/** Called from decideAndResume flows: an external run waiting on a person is resumed by the agent itself (it polls). */
export function markExternalResumed(w: World, runId: string) {
  const run = w.runs?.find((r) => r.id === runId);
  if (run && run.planner === 'external' && run.status === 'waiting') run.status = 'running';
}

function clean(p: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p ?? {}).slice(0, 10)) {
    if (typeof v === 'string') out[k.slice(0, 30)] = v.slice(0, 300);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k.slice(0, 30)] = v;
    else if (typeof v === 'boolean') out[k.slice(0, 30)] = v;
  }
  return out;
}

export { onApprovalDecided };

// ───────── company admin key (for the company's own admin panel) ─────────
const adminSecret = () => process.env.ABHED_AGENT_SECRET ?? process.env.KAVACH_AGENT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'abhed-local-dev-secret';
export const adminKeyFor = (tenant: string) => `kv_admin_${sha256(`${adminSecret()}:admin:${tenant}`).slice(0, 32)}`;
export function resolveAdmin(auth: string | null): Tenant | null {
  const key = (auth ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!key.startsWith('kv_admin_')) return null;
  for (const t of Object.keys(SECTORS)) if (adminKeyFor(t) === key) return t as Tenant;
  return null;
}
