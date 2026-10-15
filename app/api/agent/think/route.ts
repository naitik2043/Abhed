import { json } from '@/lib/api';
import { GovError } from '@/lib/engine';
import { agentFromKey, llmSpendToday, recordLlmCall } from '@/lib/live';
import { thinkForTicket } from '@/lib/planner';
import { getWorld, liveEvent, mutate, mutateLive } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** The Abhed LLM gateway: agents think only through here, with a metered, budgeted, logged model call. */
export async function POST(req: Request) {
  const agentId = agentFromKey(req.headers.get('authorization'));
  if (!agentId) return json({ error: 'Unregistered agent: no Abhed key' }, 401);
  const b = (await req.json().catch(() => ({}))) as { ticketId?: string };
  const w = await getWorld();
  const a = w.agents.find((x) => x.id === agentId)!;
  if (a.status === 'PAUSED' || a.keyRevoked) return json({ error: `${a.name} is paused: ${a.statusReason ?? ''}` }, 423);
  const t = w.tickets.find((x) => x.id === b.ticketId);
  if (!t) return json({ error: 'Unknown ticket' }, 404);
  const spent = llmSpendToday(w, agentId);
  if (spent >= a.budgetInr) return json({ error: `${a.name} hit its daily AI budget (₹${a.budgetInr})` }, 429);
  const c = w.customers.find((x) => x.id === t.customerId);
  const plan = await thinkForTicket(
    agentId,
    { id: t.id, type: t.type, text: t.text ?? t.subject, customer: c ? { id: c.id, name: c.name, email: c.email, tier: c.tier } : undefined },
    w.customerCount,
  );
  const model = plan.planner === 'llm' ? plan.model ?? 'llm' : 'offline planner';
  try {
    await mutate((x) => recordLlmCall(x, agentId, { model, tokens: plan.tokens, costInr: plan.costInr, ticketId: t.id, planner: plan.planner, reasoning: plan.reasoning }));
    await mutateLive((l) => {
      const r = l.runtimes[agentId];
      if (r) {
        r.lastThought = plan.reasoning;
        r.model = model;
        r.tokensToday += plan.tokens;
        r.llmCostToday = Number((r.llmCostToday + plan.costInr).toFixed(4));
        r.task = `${t.id} · ${t.subject}`.slice(0, 120);
        r.ticketId = t.id;
      }
      liveEvent(l, { agentId, kind: 'thought', text: `${a.name} on ${t.id}: ${plan.reasoning}`, tone: 'neutral' });
      return null;
    });
  } catch (e) {
    if (!(e instanceof GovError)) throw e;
  }
  return json({ planner: plan.planner, model, reasoning: plan.reasoning, actions: plan.actions, tokens: plan.tokens, costInr: plan.costInr });
}
