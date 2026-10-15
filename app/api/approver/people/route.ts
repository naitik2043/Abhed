import { json } from '@/lib/api';
import { isApprover, publicHuman } from '@/lib/people';
import { packFor } from '@/lib/sectors';
import { activeWorlds } from '@/lib/connect';

export const dynamic = 'force-dynamic';

/** Who can sign in as an approver, per company (names and roles only). */
export async function GET() {
  const worlds = await activeWorlds();
  return json(
    worlds.map((w) => ({
      tenant: w.sector,
      company: packFor(w.sector).company,
      people: w.humans.filter(isApprover).map((h) => {
        const p = publicHuman(h);
        return { id: p.id, name: p.name, title: p.title, roles: p.roles };
      }),
    })),
  );
}
