import { finishSession } from '@/lib/agentapi';
import { v1 } from '@/lib/v1';

export const dynamic = 'force-dynamic';

export const POST = async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return v1(req, async ({ agentId, tenant, body }) => {
    await finishSession(tenant, agentId, id, typeof body.summary === 'string' ? body.summary : undefined);
    return { ok: true };
  });
};
