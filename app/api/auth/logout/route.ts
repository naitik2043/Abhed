import { sameOrigin, signOut, tokenFrom } from '@/lib/accounts';
import { bad, withSession } from '@/lib/auth-route';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad('Cross-site request refused.', 403);
  await signOut(tokenFrom(req));
  return withSession({ account: null }, null);
}
