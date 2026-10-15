import { json } from '@/lib/api';
import { liveEvent, mutateLive } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** An approver's phone checks in (and optionally registers for push notifications). */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { name?: string; device?: string; subscription?: { endpoint: string; keys: { p256dh: string; auth: string } } | null };
  const name = String(b.name ?? '').trim().slice(0, 40);
  if (!name) return json({ error: 'Name required' }, 400);
  const key = name.toLowerCase();
  await mutateLive((l) => {
    const cur = l.approvers[key];
    const isNew = !cur || Date.now() - cur.lastSeen > 120_000;
    const sub = b.subscription && typeof b.subscription.endpoint === 'string' ? b.subscription : cur?.subscription;
    l.approvers[key] = { name, lastSeen: Date.now(), device: String(b.device ?? cur?.device ?? 'phone').slice(0, 40), push: Boolean(sub), subscription: sub ?? undefined };
    if (isNew) liveEvent(l, { agentId: 'approver', kind: 'system', text: `📱 ${name} connected as an approver${sub ? ' (push on)' : ''}`, tone: 'human' });
    return null;
  }, 'banking'); // approver phones are global: one registry for every company
  return json({ ok: true });
}
