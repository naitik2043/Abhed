import { govMutate, json } from '@/lib/api';
import { createTicket } from '@/lib/live';
import { liveEvent, mutateLive } from '@/lib/store';
import type { Ticket } from '@/lib/types';

export const dynamic = 'force-dynamic';

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 40;
}

/** Customer channel (think WhatsApp Business webhook). Abhed classifies and routes every message. */
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local';
  if (limited(ip)) return json({ error: 'Too many messages, slow down' }, 429);
  const b = (await req.json().catch(() => ({}))) as { text?: string; from?: string; email?: string; channel?: Ticket['channel']; source?: Ticket['source'] };
  const res = await govMutate((w) => {
    const t = createTicket(w, { text: String(b.text ?? ''), from: b.from, email: b.email, channel: b.channel, source: b.source === 'simulator' ? 'simulator' : 'customer' });
    return { id: t.id, type: t.type, lane: t.lane, assignee: t.assignee, why: t.why };
  }, { view: false });
  const data = (await res.clone().json()) as { result?: { id: string; type: string; lane: string; why: string } };
  if (data.result) {
    const r = data.result;
    await mutateLive((l) => {
      l.inboxCount += 1;
      liveEvent(l, { agentId: 'inbox', kind: 'system', text: `📨 ${r.id} from ${b.from ?? 'customer'} via ${b.channel ?? 'WhatsApp'}: ${r.why}`, tone: r.lane === 'HUMAN' ? 'human' : 'neutral' });
      return null;
    }).catch(() => undefined);
  }
  return res;
}
