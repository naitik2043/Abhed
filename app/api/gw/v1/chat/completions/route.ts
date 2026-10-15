import { json } from '@/lib/api';
import { companyForKey, decideTool, fingerprint, getGateway, identify, mutateGateway, pushEvent, taint, type GwVerdict } from '@/lib/gateway';
import { chat, DEFAULT_MODEL, llmAvailable, type ChatMessage } from '@/lib/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HOLD_WAIT_MS = 48_000;
const err = (message: string, status: number, type = 'invalid_request_error') => json({ error: { message, type } }, status);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * OpenAI-compatible chat completions, governed. The company changes only its base URL and API key.
 * Every tool call the model proposes is decided by Abhed's deterministic rulebook before it is returned.
 */
export async function POST(req: Request) {
  const company = await companyForKey(req.headers.get('authorization'));
  if (!company) return err('Unknown Abhed gateway key. Get one in Abhed → Connect.', 401, 'authentication_error');
  if (!llmAvailable()) return err('Abhed’s model gateway is offline right now.', 503, 'server_error');
  const body = (await req.json().catch(() => null)) as { messages?: ChatMessage[]; tools?: unknown[]; temperature?: number; max_tokens?: number; user?: string; stream?: boolean; model?: string } | null;
  if (!body?.messages?.length) return err('messages is required', 400);
  if (body.stream) return err('Streaming is not supported by the Abhed gateway yet. Send stream: false.', 400);

  const who = identify(body);
  const tainted = taint(body.messages);
  const lastUser = [...body.messages].reverse().find((m) => m.role === 'user');
  const now = Date.now();
  // first sight of this agent, and the call itself, appear live in Abhed
  await mutateGateway((d) => {
    const c = d.companies.find((x) => x.id === company.id);
    if (!c) return;
    c.firstCallAt ??= now;
    const a = c.agents[who.id];
    if (!a) {
      c.agents[who.id] = { id: who.id, name: who.name, firstSeen: now, lastSeen: now, calls: 0, toolCalls: 0, blocked: 0, held: 0, tokens: 0 };
      pushEvent(d, { company: c.id, agent: who.name, kind: 'agent', text: `New agent discovered: ${who.name}` });
    }
    c.agents[who.id].lastSeen = now;
    c.agents[who.id].calls += 1;
    if (lastUser && body.messages!.at(-1)?.role === 'user') pushEvent(d, { company: c.id, agent: who.name, kind: 'call', text: String(lastUser.content ?? '').slice(0, 200) });
    if (tainted.length) pushEvent(d, { company: c.id, agent: who.name, kind: 'flag', text: `Suspected prompt injection in the input: ${tainted.join(', ')}` });
  });

  let result;
  try {
    result = await chat({ messages: body.messages, tools: body.tools, temperature: body.temperature ?? 0, max_tokens: body.max_tokens }, 30000);
  } catch (e) {
    return err(`Upstream model error: ${e instanceof Error ? e.message : 'unknown'}`, 502, 'server_error');
  }

  const msg = result.message;
  const kept: NonNullable<ChatMessage['tool_calls']> = [];
  const refused: string[] = [];
  for (const tc of msg.tool_calls ?? []) {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments || '{}');
    } catch {
      /* unparseable arguments are judged as empty */
    }
    const t0 = performance.now();
    const v: GwVerdict = decideTool(tc.function.name, args, company.rules, { tainted });
    const ms = Number((performance.now() - t0).toFixed(2));
    const argStr = JSON.stringify(args).slice(0, 400);
    let final: GwVerdict['decision'] | 'APPROVED' | 'REJECTED' = v.decision;
    let holdId: string | null = null;
    if (v.decision === 'NEEDS_APPROVAL') {
      const fp = fingerprint(company.id, who.id, tc.function.name, argStr);
      // an identical action a person already approved goes through once
      const { result: prior } = await mutateGateway((d) => {
        const h = d.holds.find((x) => x.fingerprint === fp && x.status === 'APPROVED');
        if (h) {
          h.status = 'USED';
          return h.id;
        }
        const open = d.holds.find((x) => x.fingerprint === fp && x.status === 'PENDING');
        if (open) return `wait:${open.id}`;
        const id = `GW-${String(d.seq + 1).padStart(3, '0')}`;
        d.holds.unshift({ id, company: company.id, agent: who.name, tool: tc.function.name, args: argStr, fingerprint: fp, reason: v.reason, rule: v.rule, at: Date.now(), status: 'PENDING' });
        if (d.holds.length > 60) d.holds.length = 60;
        pushEvent(d, { company: company.id, agent: who.name, kind: 'tool', tool: tc.function.name, args: argStr, decision: 'NEEDS_APPROVAL', rule: v.rule, ms, text: v.reason });
        return `wait:${id}`;
      });
      if (prior && !prior.startsWith('wait:')) final = 'APPROVED';
      else {
        holdId = prior!.slice(5);
        const end = Date.now() + HOLD_WAIT_MS;
        while (Date.now() < end) {
          await sleep(1200);
          const h = (await getGateway()).holds.find((x) => x.id === holdId);
          if (h && h.status !== 'PENDING') {
            final = h.status === 'REJECTED' ? 'REJECTED' : 'APPROVED';
            if (h.status === 'APPROVED') await mutateGateway((d) => void (d.holds.find((x) => x.id === holdId)!.status = 'USED'));
            break;
          }
        }
      }
    }
    if (final === 'ALLOWED' || final === 'APPROVED') kept.push(tc);
    else if (final === 'NEEDS_APPROVAL') refused.push(`⏸ Abhed is holding “${tc.function.name}” for a person to approve (${holdId}). ${v.reason} Ask again once it is approved.`);
    else refused.push(`⛔ Abhed blocked “${tc.function.name}”: ${final === 'REJECTED' ? 'a person rejected it.' : v.reason}`);
    await mutateGateway((d) => {
      const c = d.companies.find((x) => x.id === company.id);
      if (c?.agents[who.id]) {
        c.agents[who.id].toolCalls += 1;
        if (final === 'BLOCKED' || final === 'REJECTED') c.agents[who.id].blocked += 1;
        if (v.decision === 'NEEDS_APPROVAL') c.agents[who.id].held += 1;
      }
      if (v.decision !== 'NEEDS_APPROVAL' || final !== 'NEEDS_APPROVAL') pushEvent(d, { company: company.id, agent: who.name, kind: 'tool', tool: tc.function.name, args: argStr, decision: final, rule: v.rule || undefined, ms, text: final === 'APPROVED' ? 'Approved by a person; executed once.' : final === 'REJECTED' ? 'Rejected by a person.' : v.reason });
    });
  }

  const out: ChatMessage = { role: 'assistant', content: msg.content ?? null };
  if (kept.length) out.tool_calls = kept;
  if (refused.length) out.content = [msg.content, ...refused].filter(Boolean).join('\n\n');
  if (!kept.length && msg.content && !refused.length) {
    await mutateGateway((d) => {
      const c = d.companies.find((x) => x.id === company.id);
      if (c?.agents[who.id]) c.agents[who.id].tokens += result.tokens;
      pushEvent(d, { company: company.id, agent: who.name, kind: 'answer', text: String(msg.content).slice(0, 220), ms: result.ms });
    });
  }
  return json({
    id: `chatcmpl-abhed-${Date.now().toString(36)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model ?? DEFAULT_MODEL,
    choices: [{ index: 0, message: out, finish_reason: kept.length ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: result.tokens },
    abhed: { agent: who.name, company: company.name, decisions: (msg.tool_calls ?? []).length, served_by: result.model },
  });
}
