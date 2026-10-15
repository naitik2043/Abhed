import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AbhedMark } from '@/components/mark';
import { LiveFeed, PublicChrome } from '@/components/site';
import { getAccount, requestUrl, safeNext } from '@/lib/session';

/** Sign in and sign up: the public bar, the form beside the live system, the same footer. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getAccount()) {
    const url = new URL(await requestUrl(), 'http://x');
    redirect(safeNext(url.searchParams.get('next')));
  }
  return (
    <PublicChrome>
      <div className="au">
        <aside className="au-side">
          <span className="au-brand" aria-hidden="true">
            <AbhedMark size={26} />
            <span>Abhed</span>
          </span>
          <div className="au-side-mid">
            <p className="au-side-k">Live from the gate</p>
            <h2>
              Every action,
              <br />
              signed &amp; sealed.
            </h2>
            <LiveFeed rows={4} />
          </div>
          <p className="au-side-foot">
            New to Abhed? <Link href="/story">See how it works</Link> first.
          </p>
        </aside>
        <div className="au-main">{children}</div>
      </div>
    </PublicChrome>
  );
}
