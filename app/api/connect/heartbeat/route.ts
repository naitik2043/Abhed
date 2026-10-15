import { resolveAgent } from '@/lib/agentapi';
import { json } from '@/lib/api';
import { heartbeat, isConnected } from '@/lib/connect';

export const dynamic = 'force-dynamic';

/** A connected website reports each of its agents alive; a disconnected one is told so. */
export async function POST(req: Request) {
  const who = resolveAgent(req.headers.get('authorization'));
  if (!who) return json({ error: 'Unknown agent key' }, 401);
  if (!(await isConnected(who.tenant))) return json({ error: 'Not connected to Abhed', notConnected: true }, 403);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  await heartbeat(who.tenant, who.agentId, String(b.site ?? ''));
  return json({ ok: true });
}
