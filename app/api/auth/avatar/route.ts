import { avatarOf, tokenFrom } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

/** The signed-in person's photo. Private: only their own session can read it. */
export async function GET(req: Request) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec((await avatarOf(tokenFrom(req))) ?? '');
  if (!m) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  return new Response(Buffer.from(m[2], 'base64'), { headers: { 'content-type': m[1], 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}
