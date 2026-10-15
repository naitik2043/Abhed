import { json } from '@/lib/api';
import { pair } from '@/lib/connect';

export const dynamic = 'force-dynamic';

const tries = new Map<string, { n: number; at: number }>();

/** A company website redeems its one-time pairing code and receives its agent keys. */
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'local';
  const t = tries.get(ip);
  if (t && t.n >= 10 && Date.now() - t.at < 60_000) return json({ error: 'Too many attempts. Wait a minute.' }, 429);
  tries.set(ip, { n: t && Date.now() - t.at < 60_000 ? t.n + 1 : 1, at: Date.now() });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const site = (b.site ?? {}) as Record<string, unknown>;
  const agents = Array.isArray(site.agents) ? (site.agents as { id?: unknown; name?: unknown }[]).slice(0, 12).map((a) => ({ id: String(a.id ?? ''), name: String(a.name ?? '') })) : [];
  const r = await pair(String(b.code ?? ''), { url: String(site.url ?? 'unknown site'), name: String(site.name ?? ''), sector: String(site.sector ?? ''), agents });
  if (!r.ok) return json({ error: r.error }, r.status);
  return json(r);
}
