import { SAMPLES } from '@/lib/lab';
import { currentTenant } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const tenant = await currentTenant(u.searchParams.get('tenant') ?? undefined);
  const kind = u.searchParams.get('kind') ?? 'tasks';
  const csv = SAMPLES[tenant]?.[kind];
  if (!csv) return new Response('unknown sample', { status: 404 });
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${tenant}-${kind}-sample.csv"` } });
}
