import { sameOrigin, signIn } from '@/lib/accounts';
import { bad, body, withSession } from '@/lib/auth-route';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad('Cross-site request refused.', 403);
  const b = await body(req);
  const r = await signIn(String(b.email ?? ''), String(b.password ?? ''));
  return r.ok ? withSession({ account: r.account }, r.token) : bad(r.error, r.status);
}
