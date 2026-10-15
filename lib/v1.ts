import { resolveAgent } from './agentapi';
import { isConnected } from './connect';
import { json } from './api';
import { GovError } from './engine';
import { releaseArenaPause } from './arena';
import { getWorld, mutate, withTenant, type Tenant } from './store';

/** Wrap a v1 handler: authenticate the agent key, pin the tenant, map errors to HTTP. */
export async function v1(req: Request, fn: (ctx: { agentId: string; tenant: Tenant; body: Record<string, unknown> }) => Promise<unknown>) {
  const who = resolveAgent(req.headers.get('authorization'));
  if (!who) return json({ error: 'Missing or unknown Abhed agent key. Unregistered agents are refused (fail-closed).' }, 401);
  if (!(await isConnected(who.tenant))) return json({ error: 'This company is not connected to Abhed. Pair the website from Abhed → Connect.', notConnected: true }, 403);
  const body = req.method === 'GET' ? {} : ((await req.json().catch(() => ({}))) as Record<string, unknown>);
  try {
    const out = await withTenant(who.tenant, async () => {
      // an agent left paused by a finished Break Abhed attempt goes back to work before serving the website
      const w = await getWorld(who.tenant);
      const a = w.agents.find((x) => x.id === who.agentId);
      if (a?.status === 'PAUSED' && /critical breach/.test(a.statusReason ?? '')) await mutate((w2) => void releaseArenaPause(w2, who.agentId), who.tenant);
      return fn({ ...who, body });
    });
    return json(out);
  } catch (e) {
    if (e instanceof GovError) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
}

export const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
