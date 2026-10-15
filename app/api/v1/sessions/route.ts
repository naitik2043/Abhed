import { openSession } from '@/lib/agentapi';
import { v1 } from '@/lib/v1';

export const dynamic = 'force-dynamic';

export const POST = (req: Request) =>
  v1(req, ({ agentId, tenant, body }) => openSession(tenant, agentId, { task: String(body.task ?? ''), from: body.from as string, site: body.site as string, subject: body.subject as string }));
