import { adminGet, adminPost } from '@/lib/admin-route';
import { currentTenant } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Same admin operations from the Abhed console, for the company selected in the top bar. */
export async function GET(req: Request) {
  return adminGet(req, await currentTenant(new URL(req.url).searchParams.get('tenant') ?? undefined));
}
export async function POST(req: Request) {
  return adminPost(req, await currentTenant(new URL(req.url).searchParams.get('tenant') ?? undefined));
}
