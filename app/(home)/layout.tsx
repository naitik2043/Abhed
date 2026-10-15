import { Shell } from '@/components/app';
import { PublicChrome } from '@/components/site';
import { getAccount } from '@/lib/session';

/** Full-bleed pages (home, how it works): the same bars and footer as every other page. */
export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  const account = await getAccount();
  return account ? <Shell account={account}>{children}</Shell> : <PublicChrome>{children}</PublicChrome>;
}
