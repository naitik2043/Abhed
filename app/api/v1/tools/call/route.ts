import { after } from 'next/server';
import { callTool } from '@/lib/agentapi';
import { pushApprovals } from '@/lib/push';
import { getWorld } from '@/lib/store';
import { v1 } from '@/lib/v1';

export const dynamic = 'force-dynamic';

export const POST = (req: Request) =>
  v1(req, async ({ agentId, tenant, body }) => {
    const r = await callTool(tenant, agentId, String(body.sessionId ?? ''), String(body.tool ?? ''), (body.args as Record<string, unknown>) ?? {});
    if (r.approvalId) {
      const w = await getWorld(tenant);
      const ap = w.approvals.find((a) => a.id === r.approvalId);
      if (ap) after(() => pushApprovals([ap]));
    }
    return r;
  });
