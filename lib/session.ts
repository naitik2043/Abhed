import { cookies, headers } from 'next/headers';
import { currentAccount, SESSION_COOKIE } from './accounts';

/** The signed-in account for this request (server components only). */
export async function getAccount() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return currentAccount(token);
}

/** The path (and query) of this request, as passed on by proxy.ts. */
export async function requestUrl() {
  return (await headers()).get('x-abhed-url') ?? '/';
}

/** A safe in-app destination from ?next=, never another site. */
export function safeNext(next: string | null | undefined, fallback = '/fleet') {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') && !next.startsWith('/signup') ? next : fallback;
}
