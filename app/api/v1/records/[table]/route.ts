import { records } from '@/lib/agentapi';
import { v1 } from '@/lib/v1';

export const dynamic = 'force-dynamic';

export const GET = async (req: Request, ctx: { params: Promise<{ table: string }> }) => {
  const { table } = await ctx.params;
  return v1(req, ({ tenant }) => records(tenant, table));
};
