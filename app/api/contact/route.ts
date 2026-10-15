import { sameOrigin, sendMessage, tokenFrom } from '@/lib/accounts';
import { json } from '@/lib/api';
import { bad, body } from '@/lib/auth-route';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad('Cross-site request refused.', 403);
  const b = await body(req);
  // a field people never see: bots fill it, people don't
  if (typeof b.website === 'string' && b.website.trim()) return json({ ok: true, id: 0 });
  const r = await sendMessage({ name: String(b.name ?? ''), email: String(b.email ?? ''), topic: String(b.topic ?? ''), message: String(b.message ?? '') }, tokenFrom(req));
  return r.ok ? json({ ok: true, id: r.id }) : bad(r.error, r.status);
}
