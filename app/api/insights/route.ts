import { json } from '@/lib/api';
import { buildInsights } from '@/lib/insights';
import { getWorld } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const w = await getWorld();
  return json(buildInsights(w));
}
