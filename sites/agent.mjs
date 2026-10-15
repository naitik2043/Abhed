import { AbhedError } from './abhed-sdk.mjs';

/**
 * The company's own agent loop. The LLM decides; Abhed governs every tool call.
 * `emit` streams each step to the website so the customer sees the agent work.
 */
export async function runAgent({ abhed, profile, task, from, subject, context, history = [], emit, maxTurns = 10 }) {
  let session;
  try {
    session = await abhed.session(task, { from, subject });
  } catch (e) {
    emit({ type: e.status === 423 ? 'paused' : 'error', text: e.message });
    return;
  }
  emit({ type: 'session', sessionId: session.sessionId, tainted: session.tainted, signals: session.signals });

  const system = `${profile.role}
You work for ${profile.company}. ${context}
Act only through tools, one call at a time. Every call passes through Abhed, the company's governance layer:
- ALLOWED: the action ran; you get the result.
- APPROVED_AND_EXECUTED: a person approved and it ran.
- BLOCKED or REJECTED: refused. Never retry the same call. If the reason shows your mistake (a wrong amount or id), correct it using facts from tools; otherwise stop and tell the customer a person will follow up.
Use only facts that tools return. Never invent amounts, ids, drugs or prices. Rupee amounts are plain numbers.
For questions about fees, timelines, rules, privacy or hours, call search_policy and answer only from what it returns, citing the policy id in brackets. If the policies don't cover it, say so and offer to connect a person.
Chatting is fine: greetings and general questions need no tool. Stay on ${profile.company} topics.
Finish with a short, friendly reply to the customer (at most 3 sentences), without calling a tool.`;
  const past = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }));
  const messages = [{ role: 'system', content: system }, ...past, { role: 'user', content: task }];

  for (let turn = 0; turn < maxTurns; turn++) {
    let r;
    try {
      r = await abhed.think(session, messages, profile.tools);
    } catch (e) {
      emit({ type: e instanceof AbhedError && e.status === 423 ? 'paused' : 'error', text: e.message });
      return;
    }
    const m = r.message;
    emit({ type: 'think', text: m.reasoning || (m.tool_calls ? m.content : '') || '', tokens: r.usage?.tokens, ms: r.usage?.ms, model: r.model });
    messages.push({ role: 'assistant', content: m.content ?? '', ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) });
    if (!m.tool_calls?.length) {
      const text = (m.content ?? '').trim() || 'Done.';
      emit({ type: 'final', text });
      await abhed.finish(session, text).catch(() => {});
      return;
    }
    for (const tc of m.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {
        /* the gateway will judge empty args */
      }
      let d;
      try {
        d = await abhed.call(session, tc.function.name, args);
      } catch (e) {
        emit({ type: e.status === 423 ? 'paused' : 'error', text: e.message });
        return;
      }
      emit({ type: 'tool', tool: tc.function.name, args, ...d });
      let result;
      if (d.decision === 'ALLOWED') result = { decision: 'ALLOWED', output: d.output };
      else if (d.decision === 'NEEDS_APPROVAL') {
        emit({ type: 'waiting', approvalId: d.approvalId, reason: d.reason });
        const a = await abhed.waitForApproval(d.approvalId);
        const by = (a.votes ?? []).map((v) => v.name).join(' + ');
        emit({ type: 'approval', approvalId: d.approvalId, status: a.status, by, output: a.output });
        result = a.status === 'EXECUTED' ? { decision: 'APPROVED_AND_EXECUTED', approvedBy: by, output: a.output } : { decision: a.status, note: 'A person decided not to allow this. Do not retry.' };
      } else {
        result = { decision: 'BLOCKED', reason: d.reason };
        if (d.paused) {
          emit({ type: 'paused', text: `Abhed paused this agent: ${d.reason}` });
          return;
        }
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 3000) });
    }
  }
  emit({ type: 'final', text: 'I have passed this to a colleague who will follow up shortly.' });
  await abhed.finish(session, 'Turn budget reached; handed to a person.').catch(() => {});
}
