import { human } from './engine';
import { verifyToken } from './people';
import { getWorld, isTenant, type Tenant } from './store';

/** Tokens arrive as `Authorization: Bearer kvp…, kvp…` (one per company the person signed into). */
export function tokensFrom(req: Request, body?: Record<string, unknown>) {
  const raw = [req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '', typeof body?.token === 'string' ? body.token : ''].join(',');
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map(verifyToken)
    .filter((x): x is { tenant: string; humanId: string } => Boolean(x) && isTenant(x!.tenant));
}

export async function identities(req: Request, body?: Record<string, unknown>) {
  const out: { tenant: Tenant; humanId: string; name: string; title: string; roles: string[] }[] = [];
  for (const t of tokensFrom(req, body)) {
    const w = await getWorld(t.tenant);
    const h = human(w, t.humanId);
    if (h) out.push({ tenant: t.tenant as Tenant, humanId: h.id, name: h.name, title: h.title, roles: h.roles });
  }
  return out;
}
