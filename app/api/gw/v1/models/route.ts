import { json } from '@/lib/api';
import { companyForKey, markLinked } from '@/lib/gateway';
import { DEFAULT_MODEL } from '@/lib/llm';

export const dynamic = 'force-dynamic';

/**
 * OpenAI-compatible model list, so SDKs and "Test connection" buttons accept the Abhed gateway.
 * It checks the key like every other call, so a wrong or rotated key fails here instead of looking connected.
 */
export async function GET(req: Request) {
  const company = await companyForKey(req.headers.get('authorization'));
  if (!company) return json({ error: { message: 'Unknown Abhed gateway key. Copy the current key from Abhed → Connect (a rotated key stops working).', type: 'authentication_error' } }, 401);
  const from = (req.headers.get('user-agent') ?? '').split(/[ /]/)[0] || 'the company';
  await markLinked(company.id, from === 'node' || from === 'undici' ? 'the company’s server' : from);
  return json({ object: 'list', data: [{ id: DEFAULT_MODEL, object: 'model', owned_by: 'abhed-gateway' }] });
}
