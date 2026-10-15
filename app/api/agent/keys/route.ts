import { directorAllowed, json } from '@/lib/api';
import { AGENT_IDS, keyFor } from '@/lib/live';

export const dynamic = 'force-dynamic';

/** The agents' owners issue Abhed credentials. Agents never see the LLM provider key or bank credentials. */
export async function POST(req: Request) {
  if (!directorAllowed(req)) return json({ error: 'Director key required' }, 401);
  return json({ keys: Object.fromEntries(AGENT_IDS.map((id) => [id, keyFor(id)])) });
}
