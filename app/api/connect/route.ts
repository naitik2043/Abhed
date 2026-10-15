import { json } from '@/lib/api';
import { activeWorlds, CODE_TTL_MS, conn, getRegistry, issueCode, ONLINE_MS, removeCompany, resetDemo } from '@/lib/connect';
import { packFor } from '@/lib/sectors';
import { getLive, getWorld, isTenant } from '@/lib/store';
import type { World } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ON_SITE: Record<string, string[]> = { banking: ['rex', 'aria'], healthcare: ['rxa', 'claimy'], ecommerce: ['shoppy', 'pricer'] };

async function view(w: World) {
  const c = conn(w);
  const live = await getLive(w.sector);
  const now = Date.now();
  const ids = c.agents ?? ON_SITE[w.sector] ?? [];
  const agents = ids.map((id) => {
    const a = w.agents.find((x) => x.id === id);
    const rt = live.runtimes[id];
    return { id, name: a?.name ?? id, job: a?.purpose ?? '', status: a?.status ?? 'ACTIVE', online: !!rt && rt.runtime === 'website' && now - rt.lastSeen < ONLINE_MS, lastSeen: rt?.lastSeen ?? null };
  });
  const names = new Set(agents.map((a) => a.name));
  const activity = w.ledger
    .filter((r) => (c.since ? r.ts >= c.since : true) && names.has(r.actorName))
    .slice(-12)
    .reverse()
    .map((r) => ({ seq: r.seq, ts: r.ts, actor: r.actorName, action: r.action, decision: r.decision, reason: r.reason, rule: r.ruleRef, ms: r.perf?.gatewayMs }));
  const pending = w.approvals.filter((a) => a.status === 'PENDING' && (!c.since || a.createdAt >= c.since)).map((a) => ({ id: a.id, summary: a.summary }));
  const rules = w.rules.filter((r) => r.active).map((r) => ({ id: `${r.id}@${r.version}`, says: r.says }));
  return {
    tenant: w.sector,
    company: c.site?.name ?? packFor(w.sector).company.replace(' (fictional)', ''),
    industry: packFor(w.sector).label,
    since: c.since ?? null,
    site: c.site ?? null,
    timeline: [...c.timeline].reverse(),
    agents,
    activity,
    pending,
    rules,
  };
}

/** Pending code + every company currently in Abhed (only connected companies exist here). */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('tenant');
  if (t && isTenant(t)) {
    const w = await getWorld(t);
    return conn(w).status === 'connected' ? json(await view(w)) : json({ error: 'Not in Abhed' }, 404);
  }
  const [reg, worlds] = await Promise.all([getRegistry(), activeWorlds()]);
  const now = Date.now();
  const live = reg.code && (reg.exp ?? 0) > now;
  return json({
    pending: live ? { code: reg.code, exp: reg.exp, ttl: CODE_TTL_MS } : null,
    log: [...reg.log].reverse().slice(0, 12),
    companies: await Promise.all(worlds.map(view)),
  });
}

const pinOk = (b: Record<string, unknown>) => String(b.pin ?? '') === (process.env.ADMIN_PIN ?? '2468');

/** code · remove { tenant, pin } · reset { pin } */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.action === 'code') return json({ code: await issueCode() });
  if (b.action === 'remove' || b.action === 'disconnect') {
    if (!isTenant(b.tenant)) return json({ error: 'Pick a company' }, 400);
    if (!pinOk(b)) return json({ error: 'Wrong PIN' }, 403);
    await removeCompany(b.tenant);
    return json({ ok: true });
  }
  if (b.action === 'reset') {
    if (!pinOk(b)) return json({ error: 'Wrong PIN' }, 403);
    await resetDemo();
    return json({ ok: true });
  }
  return json({ error: 'Unknown action' }, 400);
}
