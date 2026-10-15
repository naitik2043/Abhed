import { approvalStatus } from '@/lib/agentapi';
import { v1 } from '@/lib/v1';

export const dynamic = 'force-dynamic';

export const GET = async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return v1(req, ({ agentId, tenant }) => approvalStatus(tenant, agentId, id));
};
