import { agent, appendLedger, decideApproval, gateway, GovError, nameOf } from './engine';
import { BLOCK_EVERY, unsealedCount } from './chain';
import { pushApprovals } from './push';
import { sealAndAnchor } from './sealer';
import { scanInjection, securityEvent, OWASP } from './security';
import { offlinePlanFor, packFor } from './sectors';
import { isArenaTarget, literalPlan } from './arena';
import type { SectorPack } from './sectors';
import { currentTenant, getWorld, mutate } from './store';
import { chat, DEFAULT_MODEL, llmAvailable } from './llm';
import type { Approval, LlmMsg, Run, RunStep, World } from './types';

/**
 * Command console runs. A person gives an agent a task in plain words; the agent works it step by
 * step on the server. Every tool call goes through the Abhed gateway, so the agent only ever sees
 * what the gateway lets through: a result, a hold for a person, or a refusal.
 */

const MAX_STEPS = 10;
const KEEP_RUNS = 60;
export { llmAvailable };

const step = (run: Run, s: Omit<RunStep, 'at'>, now = Date.now()) => {
  run.steps.push({ at: now, ...s });
  run.updatedAt = now;
};

function clip(v: unknown, n = 700): unknown {
  const s = JSON.stringify(v ?? null);
  return s.length > n ? s.slice(0, n) + '…' : v;
}

export function startRun(w: World, input: { agentId: string; command: string; by?: string; planner?: 'llm' | 'offline'; subject?: string; batch?: string; redteam?: boolean }, now = Date.now()): Run {
  const pack = packFor(w.sector);
  const a = agent(w, input.agentId);
  if (!a || !pack.agentTools[input.agentId]) throw new GovError(`No agent “${input.agentId}” in ${pack.company}`, 404);
  const command = input.command.trim().slice(0, 700);
  if (command.length < 4) throw new GovError('Type a command for the agent', 400);
  w.runs ??= [];
  if (w.runs.filter((r) => r.status === 'running').length >= 6) throw new GovError('Six agents are already working. Wait for one to finish.', 429);
  const planner = input.planner === 'offline' || !llmAvailable() ? 'offline' : 'llm';
  w.counters.run = (w.counters.run ?? 0) + 1;
  const run: Run = {
    id: `RUN-${w.counters.run}`,
    sector: pack.id,
    agentId: a.id,
    command,
    by: (input.by ?? 'Operator').slice(0, 40),
    planner,
    model: input.redteam ? 'red-team planner (a compromised agent that obeys hidden instructions)' : planner === 'llm' ? DEFAULT_MODEL : 'deterministic planner',
    status: 'running',
    steps: [],
    actions: 0,
    blocks: 0,
    tokens: 0,
    costInr: 0,
    createdAt: now,
    updatedAt: now,
  };
  // content scanned before any model sees it; tainted sessions can never send customer data out
  const inj = scanInjection(command);
  w.sessions ??= {};
  const subject = input.subject && w.customers.some((c) => c.id === input.subject) ? input.subject : undefined;
  if (input.batch) run.batch = input.batch;
  w.sessions[`run:${run.id}`] = { untrusted: inj.signals.length > 0, subject };
  if (inj.signals.length) {
    run.injection = inj.signals;
    step(run, { kind: 'security', text: `Abhed scanner: possible prompt injection (${inj.signals.join(', ')}). This task is now tainted: nothing it touches may leave the company.` }, now);
    securityEvent(w, { kind: 'prompt injection', agentId: a.id, detail: `${run.id}: ${inj.signals.join(', ')}`, owasp: OWASP.ASI01, severity: 'high' }, now);
  }
  if (a.status === 'PAUSED') {
    run.status = 'paused';
    step(run, { kind: 'final', text: `${a.name} is paused (${a.statusReason ?? 'by its owner'}). Abhed refuses to start new work until a person resumes it.` }, now);
  }
  w.runs.unshift(run);
  if (w.runs.length > KEEP_RUNS) w.runs.length = KEEP_RUNS;
  return run;
}

/** One governed tool call on behalf of a run. Mutates the run with what happened. */
function act(w: World, run: Run, action: string, params: Record<string, unknown>, now: number) {
  const key = `run:${run.id}`;
  w.sessions ??= {};
  const session = { ...(w.sessions[key] ?? {}) };
  const res = gateway(w, { actorType: 'agent', actorId: run.agentId, action, params: clean(params), session, channel: 'console' }, { now, reasoning: lastThought(run) });
  const cls = packFor(w.sector).tools[action]?.dataClass ?? '';
  if (res.decision !== 'BLOCKED' && /customer|patient|phi|pii|order|transaction/i.test(cls + action)) session.customerData = true;
  w.sessions[key] = session;
  run.actions += 1;
  if (res.decision === 'BLOCKED') run.blocks += 1;
  step(
    run,
    {
      kind: 'action',
      action,
      params: clean(params),
      decision: res.decision,
      reason: res.reason,
      ruleRef: res.ruleRef,
      approvalId: res.approvalId,
      seq: res.seq,
      output: res.decision === 'ALLOWED' ? clip(res.output) : undefined,
      gatewayMs: res.gatewayMs,
      category: res.category,
      paused: res.paused,
    },
    now,
  );
  if (res.approvalId) {
    const ap = w.approvals.find((x) => x.id === res.approvalId);
    if (ap) ap.runId = run.id;
  }
  return res;
}

function lastThought(run: Run) {
  return [...run.steps].reverse().find((s) => s.kind === 'thought')?.text;
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

// ───────────────────────────── LLM planner ─────────────────────────────

function toolSchemas(pack: SectorPack, agentId: string) {
  return (pack.agentTools[agentId] ?? [])
    .map((n) => pack.tools[n])
    .filter(Boolean)
    .map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.label,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(Object.entries(t.params).map(([k, p]) => [k, { type: p.type, description: p.desc }])),
          required: Object.entries(t.params)
            .filter(([, p]) => p.required)
            .map(([k]) => k),
        },
      },
    }));
}

function systemPrompt(w: World, pack: SectorPack, run: Run) {
  const a = agent(w, run.agentId)!;
  const subject = w.sessions?.[`run:${run.id}`]?.subject;
  const c = subject ? w.customers.find((x) => x.id === subject) : undefined;
  return `You are ${a.name}, an AI agent at ${pack.company}. Your job: ${pack.roles[run.agentId] ?? a.purpose}.${c ? `\nThe customer for this task is ${c.name} (id ${c.id}, email ${c.email}). Act only for this customer.` : ''}
You act only by calling tools, one at a time. Every tool call passes through Abhed, the company's governance gateway. It answers with one of:
- ALLOWED: the action ran; you get the result from the system of record.
- NEEDS_APPROVAL: a person must approve first. Do not retry; the result arrives when they decide.
- BLOCKED: refused, with the reason. Never retry the same call. Correct your mistake if the reason shows one, or stop and explain.
Use only facts that tools returned. Never invent amounts, ids, drugs, prices or emails. Amounts are plain rupee numbers.
When the task is finished (or cannot be), reply in two short sentences without calling a tool.`;
}

async function llmTurn(run: Run, w: World): Promise<{ msg: LlmMsg; tokens: number; costInr: number }> {
  const pack = packFor(w.sector);
  const messages: LlmMsg[] = [{ role: 'system', content: systemPrompt(w, pack, run) }, { role: 'user', content: run.command }, ...(run.llm ?? [])];
  const r = await chat({ messages, tools: toolSchemas(pack, run.agentId), max_tokens: 900 });
  const msg: LlmMsg = { role: 'assistant', content: r.message.content ?? r.message.reasoning ?? null };
  if (r.message.tool_calls?.length) msg.tool_calls = r.message.tool_calls.slice(0, 1);
  return { msg, tokens: r.tokens, costInr: r.costInr };
}

function toolResult(run: Run, toolCallId: string, content: unknown) {
  run.llm ??= [];
  run.llm.push({ role: 'tool', tool_call_id: toolCallId, content: JSON.stringify(content).slice(0, 1200) });
}

// ───────────────────────────── driver ─────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Work the run until it finishes, waits for a person, or is stopped. Safe to call repeatedly. */
export async function driveRun(runId: string, opts: { paceMs?: number; tenant?: string } = {}) {
  const pace = opts.paceMs ?? 500;
  const tenant = await currentTenant(opts.tenant);
  for (let i = 0; i < MAX_STEPS + 4; i++) {
    const w = await getWorld(tenant);
    const run = w.runs?.find((r) => r.id === runId);
    if (!run || run.status !== 'running' || run.planner === 'external') return;
    const mark = run.steps.length;

    let llm: Awaited<ReturnType<typeof llmTurn>> | undefined;
    let llmError: string | undefined;
    if (run.planner === 'llm') {
      try {
        llm = await llmTurn(run, w);
      } catch (e) {
        llmError = e instanceof Error ? e.message : String(e);
      }
    }

    let created: Approval[] = [];
    const { world: after, result: cont } = await mutate((w2) => {
      const r = w2.runs?.find((x) => x.id === runId);
      if (!r || r.status !== 'running' || r.steps.length !== mark) return false; // someone else advanced it
      const before = new Set(w2.approvals.map((x) => x.id));
      const now = Date.now();
      const out = advance(w2, r, llm, llmError, now);
      created = w2.approvals.filter((x) => !before.has(x.id) && x.status === 'PENDING');
      return out;
    }, tenant);
    if (created.length) await pushApprovals(created).catch(() => undefined);
    if (unsealedCount(after) >= BLOCK_EVERY) await sealAndAnchor({ tenant }).catch(() => undefined);
    if (!cont) return;
    if (pace) await sleep(pace);
  }
}

function advance(w: World, run: Run, llm: Awaited<ReturnType<typeof llmTurn>> | undefined, llmError: string | undefined, now: number): boolean {
  const a = agent(w, run.agentId);
  if (!a || a.status === 'PAUSED') {
    run.status = 'paused';
    step(run, { kind: 'final', text: `${a?.name ?? run.agentId} was paused (${a?.statusReason ?? 'by its owner'}). Work stopped.` }, now);
    return false;
  }
  if (run.actions >= MAX_STEPS) {
    run.status = 'done';
    step(run, { kind: 'final', text: `Stopped after ${MAX_STEPS} actions (step budget).` }, now);
    return false;
  }

  if (run.planner === 'llm' && llmError) {
    step(run, { kind: 'thought', text: `LLM unavailable (${llmError}). Switching to the deterministic planner.` }, now);
    run.planner = 'offline';
    run.model = 'deterministic planner';
  }

  if (run.planner === 'llm' && llm) {
    run.tokens += llm.tokens;
    run.costInr = Number((run.costInr + llm.costInr).toFixed(4));
    recordLlm(w, run, llm.tokens, llm.costInr, now);
    run.llm ??= [];
    run.llm.push(llm.msg);
    if (llm.msg.content?.trim()) step(run, { kind: llm.msg.tool_calls ? 'thought' : 'final', text: llm.msg.content.trim().slice(0, 600) }, now);
    const call = llm.msg.tool_calls?.[0];
    if (!call) {
      run.status = 'done';
      if (!llm.msg.content?.trim()) step(run, { kind: 'final', text: 'Finished.' }, now);
      return false;
    }
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(call.function.arguments || '{}');
    } catch {
      toolResult(run, call.id, { decision: 'BLOCKED', reason: 'Arguments were not valid JSON.' });
      return true;
    }
    const res = act(w, run, call.function.name, params, now);
    if (res.decision === 'ALLOWED') toolResult(run, call.id, { decision: 'ALLOWED', result: res.output ?? 'done' });
    else if (res.decision === 'NEEDS_APPROVAL') {
      run.status = 'waiting';
      run.pendingApprovalId = res.approvalId;
      run.pendingToolCallId = call.id;
      return false;
    } else {
      toolResult(run, call.id, { decision: 'BLOCKED', reason: res.reason, rule: res.ruleRef });
      if (res.paused) return stopPaused(w, run, res.reason, now);
      if (run.blocks >= 3) {
        run.status = 'blocked';
        step(run, { kind: 'final', text: 'Stopped: three actions were refused by Abhed.' }, now);
        return false;
      }
    }
    return true;
  }

  // deterministic planner
  if (!run.queue) {
    const pack = packFor(w.sector);
    const subject = w.sessions?.[`run:${run.id}`]?.subject;
    const plan =
      run.literal && isArenaTarget(run.agentId)
        ? literalPlan(run.command, run.agentId, w)
        : offlinePlanFor(pack, run.agentId, { text: run.command, customer: subject ? w.customers.find((c) => c.id === subject) : undefined }, w);
    run.queue = plan.actions.slice(0, MAX_STEPS);
    step(run, { kind: 'thought', text: plan.reasoning || 'Planning the steps.' }, now);
    return true;
  }
  const next = run.queue.shift();
  if (!next) {
    run.status = 'done';
    const did = run.steps.filter((s) => s.kind === 'action');
    step(run, { kind: 'final', text: `Done: ${did.length} action${did.length === 1 ? '' : 's'} (${did.filter((s) => s.decision === 'ALLOWED' || s.decision === 'EXECUTED').length} ran, ${did.filter((s) => s.decision === 'NEEDS_APPROVAL').length} needed a person, ${did.filter((s) => s.decision === 'BLOCKED').length} refused).` }, now);
    return false;
  }
  const res = act(w, run, next.action, next.params, now);
  if (res.decision === 'NEEDS_APPROVAL') {
    run.status = 'waiting';
    run.pendingApprovalId = res.approvalId;
    return false;
  }
  if (res.decision === 'BLOCKED') {
    if (res.paused) return stopPaused(w, run, res.reason, now);
    run.status = 'blocked';
    step(run, { kind: 'final', text: `Stopped: Abhed refused ${next.action.replace(/_/g, ' ')}. ${res.reason}` }, now);
    return false;
  }
  return true;
}

function stopPaused(w: World, run: Run, reason: string, now: number) {
  run.status = 'paused';
  const a = agent(w, run.agentId);
  step(run, { kind: 'final', text: `Abhed paused ${a?.name ?? run.agentId} after a critical policy breach: ${reason} Its key is revoked and its open work goes to a person. An incident is open for the owner (${a ? nameOf(w, a.owner) : 'owner'}).` }, now);
  return false;
}

function recordLlm(w: World, run: Run, tokens: number, costInr: number, now: number) {
  const a = agent(w, run.agentId);
  if (!a) return;
  // the LLM call is part of the audit trail (model, tokens, cost), never the prompt text
  appendLedger(w, {
    ts: now,
    actorType: 'agent',
    actorId: run.agentId,
    actorName: a.name,
    onBehalfOf: nameOf(w, a.owner),
    action: 'llm_call',
    params: { model: run.model ?? 'llm', tokens },
    decision: 'INFO',
    reason: `${a.name} thought via the Abhed LLM gateway (${run.model}, ${tokens} tokens) for ${run.id}.`,
    cost: costInr,
    meta: { runId: run.id, model: run.model },
  });
}

/** A person decided an approval; if a run was waiting on it, feed the outcome back and let it continue. */
export function decideAndResume(w: World, id: string, input: Parameters<typeof decideApproval>[2], now = Date.now()) {
  const ap = decideApproval(w, id, input, now);
  const runId = onApprovalDecided(w, ap, now);
  return { ap, runId };
}

export function onApprovalDecided(w: World, ap: Approval, now = Date.now()): string | undefined {
  if (!ap.runId || ap.status === 'PENDING') return undefined;
  const run = w.runs?.find((r) => r.id === ap.runId);
  if (!run || run.status !== 'waiting' || run.pendingApprovalId !== ap.id) return undefined;
  const who = ap.votes.map((v) => v.name).join(' + ');
  run.pendingApprovalId = undefined;
  if (run.planner === 'external') {
    // the company's own agent is polling this approval; it continues by itself
    step(run, { kind: 'result', action: ap.req.action, decision: ap.status, approvalId: ap.id, seq: ap.executedSeq, output: ap.status === 'EXECUTED' ? clip(ap.output) : undefined, text: ap.status === 'EXECUTED' ? `${who} approved ${ap.id} on their phone. Executed exactly as approved.` : ap.status === 'REJECTED' ? `${who} rejected ${ap.id}.` : `${ap.id} is ${ap.status.toLowerCase()}.` }, now);
    run.status = 'running';
    return undefined;
  }
  if (ap.status === 'EXECUTED') {
    step(run, { kind: 'result', action: ap.req.action, decision: 'EXECUTED', approvalId: ap.id, seq: ap.executedSeq, output: clip(ap.output), text: `${who} approved ${ap.id} on their phone. Executed exactly as approved.` }, now);
    if (run.pendingToolCallId) toolResult(run, run.pendingToolCallId, { decision: 'APPROVED_AND_EXECUTED', approvedBy: who, result: ap.output ?? 'done' });
    run.pendingToolCallId = undefined;
    run.status = 'running';
    return run.id;
  }
  const why = ap.status === 'REJECTED' ? `${who} rejected ${ap.id}.` : `${ap.id} is ${ap.status.toLowerCase()}.`;
  step(run, { kind: 'result', action: ap.req.action, decision: ap.status, approvalId: ap.id, text: why }, now);
  if (run.planner === 'llm' && run.pendingToolCallId) {
    toolResult(run, run.pendingToolCallId, { decision: ap.status, reason: why + ' Do not retry this action.' });
    run.pendingToolCallId = undefined;
    run.status = 'running';
    return run.id;
  }
  run.status = 'blocked';
  step(run, { kind: 'final', text: `Stopped: ${why} The agent does not try again.` }, now);
  return undefined;
}
