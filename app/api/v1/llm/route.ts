import { think } from '@/lib/agentapi';
import type { ChatMessage } from '@/lib/llm';
import { v1 } from '@/lib/v1';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = (req: Request) =>
  v1(req, ({ agentId, tenant, body }) => think(tenant, agentId, String(body.sessionId ?? ''), { messages: (body.messages as ChatMessage[]) ?? [], tools: body.tools as unknown[] }));
