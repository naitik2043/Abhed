import { json } from '@/lib/api';
import { human } from '@/lib/engine';
import { checkPin, personStats, publicHuman, signToken } from '@/lib/people';
import { OWASP, securityEvent } from '@/lib/security';
import { packFor } from '@/lib/sectors';
import { getWorld, isTenant, mutate } from '@/lib/store';

export const dynamic = 'force-dynamic';

const tries = new Map<string, { n: number; until: number }>();

/** An approver signs in on their phone: company + person + PIN → a signed 12-hour token. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { tenant?: string; humanId?: string; pin?: string };
  if (!isTenant(b.tenant)) return json({ error: 'Pick a company' }, 400);
  const key = `${b.tenant}:${b.humanId}`;
  const t = tries.get(key);
  if (t && t.n >= 5 && Date.now() < t.until) return json({ error: 'Too many wrong PINs. Try again in a minute.' }, 429);
  const w = await getWorld(b.tenant);
  const h = human(w, String(b.humanId ?? ''));
  if (!h || !checkPin(h, String(b.pin ?? ''))) {
    tries.set(key, { n: (t?.n ?? 0) + 1, until: Date.now() + 60_000 });
    if ((t?.n ?? 0) + 1 >= 3)
      await mutate((x) => {
        securityEvent(x, { kind: 'approver PIN failures', agentId: String(b.humanId ?? '?'), detail: `${(t?.n ?? 0) + 1} wrong PINs for ${h?.name ?? b.humanId}`, owasp: OWASP.ASI09, severity: 'medium' });
        return null;
      }, b.tenant).catch(() => undefined);
    return json({ error: 'Wrong PIN' }, 401);
  }
  tries.delete(key);
  return json({ token: signToken(b.tenant, h.id), tenant: b.tenant, company: packFor(b.tenant).company, person: publicHuman(h), stats: personStats(w, h) });
}
