import { sameOrigin, saveProfile, tokenFrom, type ProfilePatch } from '@/lib/accounts';
import { json } from '@/lib/api';
import { bad, body } from '@/lib/auth-route';

export const dynamic = 'force-dynamic';

const FIELDS = ['name', 'company', 'role', 'title', 'phone', 'location', 'website', 'bio', 'avatar'] as const;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad('Cross-site request refused.', 403);
  const token = tokenFrom(req);
  if (!token) return bad('Sign in first.', 401);
  if (Number(req.headers.get('content-length') ?? 0) > 600_000) return bad('That photo is too large. Use one under 300 KB.', 413);
  const b = await body(req);
  const patch: ProfilePatch = {};
  for (const k of FIELDS) if (typeof b[k] === 'string') patch[k] = b[k] as string;
  const r = await saveProfile(token, patch);
  return r.ok ? json({ account: r.account }) : bad(r.error, r.status);
}
