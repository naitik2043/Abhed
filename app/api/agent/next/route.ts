import { govMutate, json } from '@/lib/api';
import { agentFromKey, nextTicketFor } from '@/lib/live';
import { getWorld } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const agentId = agentFromKey(req.headers.get('authorization'));
  if (!agentId) return json({ error: 'Unregistered agent: no Abhed key' }, 401);
  // cheap read first: don't write the world when there's nothing to hand out
  const w0 = await getWorld();
  const a = w0.agents.find((x) => x.id === agentId)!;
  if (a.status === 'PAUSED' || a.keyRevoked) return json({ error: `${a.name} is paused: ${a.statusReason ?? 'by its owner'}`, by: a.statusBy }, 423);
  const now = Date.now();
  const any = w0.tickets.some(
    (x) => x.assignee === agentId && !x.reserved && (x.lane === 'AGENT' || x.lane === 'AGENT_REVIEW') && (!x.claimedAt || now - x.claimedAt > 90_000),
  );
  if (!any) return json({ result: null });
  return govMutate((w) => {
    const t = nextTicketFor(w, agentId);
    if (!t) return null;
    const c = w.customers.find((x) => x.id === t.customerId);
    return {
      id: t.id,
      type: t.type,
      text: t.text ?? t.subject,
      channel: t.channel,
      vip: t.vip,
      customer: c ? { id: c.id, name: c.name, email: c.email, tier: c.tier } : undefined,
    };
  }, { view: false });
}
