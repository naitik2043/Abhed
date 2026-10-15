import { json } from '@/lib/api';
import { verifyLedger } from '@/lib/engine';
import { getWorld } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const v = verifyLedger(await getWorld());
  return json({ valid: v.valid, first_bad_seq: v.firstBadSeq, checked: v.checked });
}
