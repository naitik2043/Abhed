import { json } from '@/lib/api';
import { getWorld } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** What the customer sees: where their message went and what happened, step by step (no internals leaked). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tid = `#${decodeURIComponent(id).replace(/^#/, '')}`;
  const w = await getWorld();
  const t = w.tickets.find((x) => x.id === tid);
  if (!t) return json({ error: 'Not found' }, 404);
  const steps = w.ledger
    .filter((r) => r.ticketId === tid && r.action !== 'llm_call')
    .slice(-12)
    .map((r) => ({
      seq: r.seq,
      ts: r.ts,
      who: r.actorName,
      what: String(r.meta?.desc ?? r.action.replace(/_/g, ' ')).replace(`${r.actorName} → `, ''),
      decision: r.decision,
      approvers: r.approvers,
    }));
  const thought = w.ledger.filter((r) => r.ticketId === tid && r.action === 'llm_call').at(-1)?.reason ?? null;
  const pending = w.approvals.find((a) => a.req.ticketId === tid && a.status === 'PENDING');
  return json({
    id: t.id,
    lane: t.lane,
    why: t.why,
    assignee: w.agents.find((a) => a.id === t.assignee)?.name ?? w.humans.find((h) => h.id === t.assignee)?.name ?? t.assignee,
    steps,
    thought,
    waitingFor: pending ? { id: pending.id, role: pending.approverRole } : null,
  });
}
