import { json } from '@/lib/api';
import { agentFromKey } from '@/lib/live';
import { getWorld } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const agentId = agentFromKey(req.headers.get('authorization'));
  if (!agentId) return json({ error: 'Unregistered agent' }, 401);
  const { id } = await ctx.params;
  const w = await getWorld();
  const ap = w.approvals.find((a) => a.id === id && a.req.actorId === agentId);
  if (!ap) return json({ error: 'Not your approval' }, 404);
  return json({ id: ap.id, status: ap.status, approvers: ap.votes.map((v) => v.name), executedSeq: ap.executedSeq ?? null });
}
