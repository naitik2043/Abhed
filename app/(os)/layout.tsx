import { redirect } from 'next/navigation';
import { Shell } from '@/components/app';
import { getAccount, requestUrl } from '@/lib/session';

export default async function OsLayout({ children }: { children: React.ReactNode }) {
  const account = await getAccount();
  if (!account) redirect(`/login?next=${encodeURIComponent(await requestUrl())}`);
  return <Shell account={account}>{children}</Shell>;
}
