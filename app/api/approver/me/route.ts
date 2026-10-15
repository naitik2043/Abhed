import { json } from '@/lib/api';
import { identities } from '@/lib/approver-auth';
import { human } from '@/lib/engine';
import { personStats, publicHuman } from '@/lib/people';
import { packFor } from '@/lib/sectors';
import { getWorld } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** The approver's profile in every company they are signed into. */
export async function GET(req: Request) {
  const ids = await identities(req);
  const out = [];
  for (const id of ids) {
    const w = await getWorld(id.tenant);
    const h = human(w, id.humanId)!;
    out.push({ tenant: id.tenant, company: packFor(id.tenant).company, person: publicHuman(h), stats: personStats(w, h) });
  }
  return json({ profiles: out });
}
