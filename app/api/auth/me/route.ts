import { currentAccount, tokenFrom } from '@/lib/accounts';
import { json } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return json({ account: await currentAccount(tokenFrom(req)) });
}
