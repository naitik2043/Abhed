import { after } from 'next/server';
import { json } from '@/lib/api';
import { ARENA_TARGETS, arenaFeed, checkOf, isArenaTarget, launchAttack, releaseArenaPause } from '@/lib/arena';
import { GovError } from '@/lib/engine';
import { driveRun } from '@/lib/runs';
import { activeWorlds, isConnected } from '@/lib/connect';
import { mutate, TENANTS, type Tenant } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const COMPANY: Record<string, string> = { banking: 'NovaBank', healthcare: 'Sanjeevani Hospital', ecommerce: 'Bazaar.in' };

/** War Room feed: every attack across the three companies, plus the live gateway ticker. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  const worlds = await activeWorlds();
  const attacks = worlds.flatMap((w) => arenaFeed(w)).sort((a, b) => b.at - a.at);
  if (id) return json({ attack: attacks.find((a) => a.id === id) ?? null });

  const since = Date.now() - 24 * 3_600_000;
  const ticker = worlds
    .flatMap((w) =>
      w.ledger
        .slice(-40)
        .filter((r) => r.ts > since && r.action !== 'llm_call')
        .map((r) => ({
          company: COMPANY[w.sector] ?? w.company,
          seq: r.seq,
          ts: r.ts,
          actor: r.actorName,
          action: r.action,
          decision: r.decision,
          rule: r.ruleRef,
          reason: r.reason,
          check: checkOf({ decision: r.decision, category: (r.perf as { category?: string } | undefined)?.category ?? (r.meta?.category as string | undefined), reason: r.reason }),
          ms: (r.perf as { gatewayMs?: number } | undefined)?.gatewayMs,
          amount: typeof r.params?.amount === 'number' ? (r.params.amount as number) : undefined,
          hash: r.hash?.slice(0, 10),
        })),
    )
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 40);

  const steps = attacks.flatMap((a) => [...(a.model?.steps ?? []), ...(a.twin?.steps ?? [])]);
  const checks: Record<string, number> = {};
  for (const s of steps) checks[s.check] = (checks[s.check] ?? 0) + 1;
  const ms = steps.map((s) => s.ms).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
  const stats = {
    attacks: attacks.length,
    attackers: new Set(attacks.map((a) => a.name.toLowerCase())).size,
    stopped: attacks.reduce((n, a) => n + a.stopped, 0),
    held: attacks.reduce((n, a) => n + a.held, 0),
    through: attacks.reduce((n, a) => n + a.through.length, 0),
    rupees: attacks.reduce((n, a) => n + a.rupees, 0),
    records: attacks.reduce((n, a) => n + a.records, 0),
    paused: steps.filter((s) => s.paused).length,
    modelRefused: attacks.filter((a) => a.model && a.done && !(a.model.steps ?? []).some((s) => !['read_ticket', 'read_customer', 'read_patient', 'lookup_order', 'lookup_transaction', 'search_policy'].includes(s.action))).length,
    medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : null,
    checks,
    ledger: worlds.reduce((n, w) => n + w.ledger.length, 0),
    chainValid: true,
  };
  const live = new Set(worlds.map((w) => w.sector));
  const targets = Object.fromEntries(Object.entries(ARENA_TARGETS).filter(([, v]) => live.has(v.tenant)));
  return json({ attacks: attacks.slice(0, 30), ticker, stats, targets });
}

const recent = new Map<string, number>();

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? '').trim().slice(0, 32) || 'Anonymous';
  const text = String(body.text ?? '').trim().slice(0, 500);
  const agentId = body.agent;
  if (!isArenaTarget(agentId)) return json({ error: 'Pick Rex, Claimy or Shoppy.' }, 400);
  if (text.length < 6) return json({ error: 'Write what you want the agent to do.' }, 400);
  const key = `${name.toLowerCase()}|${req.headers.get('x-forwarded-for') ?? ''}`;
  if (Date.now() - (recent.get(key) ?? 0) < 8000) return json({ error: 'One attack every 8 seconds. Watch the screen.' }, 429);
  recent.set(key, Date.now());

  const tenant = ARENA_TARGETS[agentId].tenant as Tenant;
  if (!(await isConnected(tenant))) return json({ error: `${ARENA_TARGETS[agentId].company} is not connected to Abhed right now.` }, 409);
  try {
    const { result } = await mutate((w) => {
      try {
        return { ok: true as const, attack: launchAttack(w, { name, agentId, text }) };
      } catch (e) {
        if (e instanceof GovError) return { ok: false as const, error: e.message, status: e.status };
        throw e;
      }
    }, tenant);
    if (!result.ok) return json({ error: result.error }, result.status);
    const { attack } = result;
    // the real model first, so the twin's auto-pause can't affect it
    after(async () => {
      if (attack.modelRun) await driveRun(attack.modelRun, { tenant, paceMs: 0 }).catch(() => undefined);
      await driveRun(attack.twinRun, { tenant, paceMs: 250 }).catch(() => undefined);
      // the owner reviews the blocked attempt and puts the agent back to work, on the record
      await mutate((w) => {
        const a = w.agents.find((x) => x.id === agentId);
        if (a) releaseArenaPause(w, a.id);
      }, tenant).catch(() => undefined);
    });
    return json({ attack: { id: attack.id, agentId, company: ARENA_TARGETS[agentId].company } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
}

/** Presenter clears the War Room before judging (the ledger itself is never touched). */
export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (String(body.pin ?? '') !== (process.env.ADMIN_PIN ?? '2468')) return json({ error: 'Wrong PIN' }, 403);
  for (const t of TENANTS) await mutate((w) => void (w.arena = []), t);
  return json({ cleared: true });
}
