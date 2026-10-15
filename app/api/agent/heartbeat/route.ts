import { json } from '@/lib/api';
import { agentFromKey } from '@/lib/live';
import { getWorld, mutateLive } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const agentId = agentFromKey(req.headers.get('authorization'));
  if (!agentId) return json({ error: 'Unregistered agent: no Abhed key' }, 401);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const now = Date.now();
  await mutateLive((l) => {
    const cur = l.runtimes[agentId];
    l.runtimes[agentId] = {
      agentId,
      host: String(b.host ?? cur?.host ?? 'unknown').slice(0, 40),
      pid: Number(b.pid ?? cur?.pid ?? 0),
      runtime: String(b.runtime ?? cur?.runtime ?? 'node').slice(0, 40),
      startedAt: Number(b.startedAt ?? cur?.startedAt ?? now),
      lastSeen: now,
      task: typeof b.task === 'string' ? b.task.slice(0, 120) : cur?.task,
      ticketId: typeof b.ticketId === 'string' ? b.ticketId : cur?.ticketId,
      lastThought: cur?.lastThought,
      lastDecision: cur?.lastDecision,
      model: cur?.model,
      tokensToday: cur?.tokensToday ?? 0,
      llmCostToday: cur?.llmCostToday ?? 0,
      calls: cur?.calls ?? 0,
    };
    return null;
  });
  const w = await getWorld();
  const a = w.agents.find((x) => x.id === agentId)!;
  return json({ agent: a.name, status: a.status, reason: a.statusReason ?? null, by: a.statusBy ?? null });
}
