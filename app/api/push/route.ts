import { json } from '@/lib/api';
import { pushPublicKey } from '@/lib/push';

export const dynamic = 'force-dynamic';

export async function GET() {
  return json({ publicKey: pushPublicKey() });
}
