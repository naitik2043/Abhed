import { Shell } from '@/components/app';
import { PublicChrome } from '@/components/site';
import { getAccount } from '@/lib/session';

/** Public pages: the public bar before sign-in, the app bar after it; the same footer either way. */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const account = await getAccount();
  const page = <main className="st-main">{children}</main>;
  return account ? (
    <Shell account={account}>
      <div className="st st-in-app">{page}</div>
    </Shell>
  ) : (
    <PublicChrome>{page}</PublicChrome>
  );
}
