import { sameOrigin, signUp } from '@/lib/accounts';
import { bad, body, withSession } from '@/lib/auth-route';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad('Cross-site request refused.', 403);
  const b = await body(req);
  if (b.agree !== true) return bad('Please accept the terms and privacy policy.', 400);
  const r = await signUp({ email: String(b.email ?? ''), password: String(b.password ?? ''), name: String(b.name ?? ''), company: String(b.company ?? ''), role: String(b.role ?? '') });
  return r.ok ? withSession({ account: r.account }, r.token, 201) : bad(r.error, r.status);
}
