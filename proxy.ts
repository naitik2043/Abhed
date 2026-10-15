import { NextResponse, type NextRequest } from 'next/server';

/**
 * Features need an account. A visitor without a session who opens one is sent to sign in, and comes back to the
 * same page afterwards. The phone surfaces (approver app, Break Abhed attack page, support chat) and every public
 * page stay open. Pages still verify the session on the server; this only does the fast redirect.
 */
const FEATURES = ['/arena', '/business', '/command', '/connect', '/demo', '/fleet', '/incidents', '/insights', '/integrate', '/lab', '/ledger', '/readiness', '/rules', '/security', '/twin', '/account'];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const signedIn = /^[0-9a-f]{64}$/.test(req.cookies.get('abhed_session')?.value ?? '');
  if (!signedIn && FEATURES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const to = req.nextUrl.clone();
    to.pathname = '/login';
    to.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(to);
  }
  const h = new Headers(req.headers);
  h.set('x-abhed-url', pathname + search);
  return NextResponse.next({ request: { headers: h } });
}

export const config = {
  // pages only: not the API, not Next's assets, not files in public/
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
