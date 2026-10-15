import { resolveAdmin } from '@/lib/agentapi';
import { adminGet, adminPost } from '@/lib/admin-route';
import { json } from '@/lib/api';
import { isConnected } from '@/lib/connect';

const refused = () => json({ error: 'This company is not connected to Abhed. Pair the website from Abhed → Connect.', notConnected: true }, 403);

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The company's own admin panel talks to Abhed with a company admin key (never exposed to browsers). */
export async function GET(req: Request) {
  const t = resolveAdmin(req.headers.get('authorization'));
  if (!t) return json({ error: 'Company admin key required' }, 401);
  return (await isConnected(t)) ? adminGet(req, t) : refused();
}
export async function POST(req: Request) {
  const t = resolveAdmin(req.headers.get('authorization'));
  if (!t) return json({ error: 'Company admin key required' }, 401);
  return (await isConnected(t)) ? adminPost(req, t) : refused();
}
