import { profile } from '@/lib/agentapi';
import { getWorld } from '@/lib/store';
import { v1 } from '@/lib/v1';

export const dynamic = 'force-dynamic';

/** Who am I, what may I do, and the tool schemas to hand my LLM. */
export const GET = (req: Request) => v1(req, async ({ agentId, tenant }) => profile(await getWorld(tenant), agentId));
