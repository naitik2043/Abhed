import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_DAYS, type Account } from './accounts';

/** JSON response that also sets (or clears) the session cookie: HttpOnly, SameSite=Lax, Secure in production. */
export function withSession(body: { account: Account | null } & Record<string, unknown>, token: string | null, status = 200) {
  const res = NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
  res.cookies.set(SESSION_COOKIE, token ?? '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: token ? SESSION_DAYS * 86_400 : 0,
  });
  return res;
}
export const bad = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'cache-control': 'no-store' } });
export async function body(req: Request) {
  return ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
}
