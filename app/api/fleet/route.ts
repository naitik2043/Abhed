import { json } from '@/lib/api';
import { nameOf } from '@/lib/engine';
import { activeWorlds, conn } from '@/lib/connect';
import { buildInsights } from '@/lib/insights';
import { llmAvailable } from '@/lib/llm';
import { packFor } from '@/lib/sectors';
import { getLive } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** The agents that serve customers on each company's own website (the others are internal agents). */
const ON_SITE: Record<string, string[]> = { banking: ['rex', 'aria'], healthcare: ['rxa', 'claimy'], ecommerce: ['shoppy', 'pricer'] };

const SITES: Record<string, string> = {
  banking: process.env.SITE_URL_BANKING ?? 'https://abhed-novabank.onrender.com',
  healthcare: process.env.SITE_URL_HEALTHCARE ?? 'https://abhed-sanjeevani.onrender.com',
  ecommerce: process.env.SITE_URL_ECOMMERCE ?? 'https://abhed-bazaar.onrender.com',
};

/** Every company Abhed governs, live: agents, sessions, approvals, decisions, speed. */
export async function GET() {
  const now = Date.now();
  const [worlds, phones] = await Promise.all([activeWorlds(), getLive('banking')]);
  const companies = worlds.map((w) => {
    const pack = packFor(w.sector);
    const ins = buildInsights(w, now);
    // a company that joined live shows the agents its website declared; NovaBank (set up in advance) shows all
    const siteAgents = new Set(conn(w).agents ?? Object.keys(pack.agentTools));
    return {
      tenant: w.sector,
      company: conn(w).site?.name ?? pack.company,
      label: pack.label,
      site: conn(w).site?.url ?? SITES[w.sector],
      connection: conn(w).status,
      agents: ins.agents
        .filter((a) => siteAgents.has(a.id))
        .map((a) => ({ ...a, onSite: (ON_SITE[w.sector] ?? []).includes(a.id), purpose: w.agents.find((x) => x.id === a.id)?.purpose, statusReason: w.agents.find((x) => x.id === a.id)?.statusReason }))
        .sort((a, b) => Number(b.onSite) - Number(a.onSite)),
      mix: ins.mix,
      speed: ins.speed,
      human: ins.human,
      series: ins.series,
      reasons: ins.reasons.slice(0, 5),
      blockReasons: ins.blockReasons,
      approvals: w.approvals.reduce<Record<string, number>>((m, a) => ((m[a.hold && a.status === 'PENDING' ? 'ON HOLD' : a.status] = (m[a.hold && a.status === 'PENDING' ? 'ON HOLD' : a.status] ?? 0) + 1), m), {}),
      people: w.humans.length,
      integrity: { ledger: ins.integrity.ledger.valid, chain: ins.integrity.chain.valid, blocks: ins.integrity.chain.blocks, records: w.ledger.length },
      incidents: w.incidents.filter((i) => i.status !== 'RESOLVED').length,
    };
  });
  const sessions = worlds
    .flatMap((w) =>
      (w.runs ?? []).map(({ llm: _l, queue: _q, ...r }) => ({
        ...r,
        company: packFor(w.sector).company,
        tenant: w.sector,
        agentName: w.agents.find((a) => a.id === r.agentId)?.name ?? r.agentId,
        owner: nameOf(w, w.agents.find((a) => a.id === r.agentId)?.owner ?? ''),
        steps: r.steps.slice(-14),
      })),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 12);
  const pending = worlds.flatMap((w) =>
    w.approvals
      .filter((a) => a.status === 'PENDING')
      .map((a) => ({ id: a.id, tenant: w.sector, company: packFor(w.sector).company, summary: a.summary, why: a.why, approverRole: a.approverRole, twoKey: a.twoKey, votes: a.votes.map((v) => v.name), createdAt: a.createdAt, runId: a.runId })),
  );
  const decided = worlds
    .flatMap((w) => w.approvals.filter((a) => a.votes.length && a.status !== 'PENDING').map((a) => ({ id: a.id, company: packFor(w.sector).company, summary: a.summary, status: a.status, by: a.votes.map((v) => `${v.name} (${v.device}, ${Math.round(v.decisionMs / 100) / 10}s)`).join(' + '), at: a.votes[a.votes.length - 1].at, waitS: Math.round((a.votes[a.votes.length - 1].at - a.createdAt) / 1000) })))
    .sort((a, b) => b.at - a.at)
    .slice(0, 8);
  const feed = worlds
    .flatMap((w) =>
      w.ledger
        .slice(-40)
        .filter((r) => !r.meta?.sample)
        .map((r) => ({ seq: r.seq, ts: r.ts, company: packFor(w.sector).company, tenant: w.sector, actor: r.actorName, action: r.action, decision: r.decision, reason: r.reason, ruleRef: r.ruleRef, ms: r.perf?.gatewayMs, approvers: r.approvers, desc: r.meta?.desc })),
    )
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 40);
  const security = worlds.flatMap((w) => (w.security ?? []).slice(0, 10).map((s) => ({ ...s, company: packFor(w.sector).company }))).sort((a, b) => b.at - a.at).slice(0, 10);
  // one fleet-wide series: every agent action across companies, same buckets, so the big chart is honest
  const acts = worlds.flatMap((w) => w.ledger.filter((r) => !r.meta?.sample && r.actorType === 'agent' && r.action !== 'llm_call' && ['ALLOWED', 'NEEDS_APPROVAL', 'BLOCKED', 'EXECUTED'].includes(r.decision) && !r.approvers.length));
  const recentActs = acts.filter((r) => now - r.ts < 3_600_000);
  const hourly = recentActs.length < 3;
  const bucketMs = hourly ? 3_600_000 : 120_000;
  const n = hourly ? 24 : 30;
  const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((x, y) => x - y)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : null);
  const points = Array.from({ length: n }, (_, i) => {
    const start = now - (n - i) * bucketMs;
    const rows = acts.filter((r) => r.ts >= start && r.ts < start + bucketMs);
    const ms = rows.map((r) => r.perf?.gatewayMs).filter((x): x is number => typeof x === 'number');
    return { t: start, auto: rows.filter((r) => r.decision === 'ALLOWED').length, held: rows.filter((r) => r.decision === 'NEEDS_APPROVAL').length, blocked: rows.filter((r) => r.decision === 'BLOCKED').length, p95: pct(ms, 95) ?? 0, p50: pct(ms, 50) ?? 0 };
  });
  const lives = await Promise.all(worlds.map((w) => getLive(w.sector)));
  const lastMin = acts.filter((r) => now - r.ts < 60_000);
  const last5 = acts.filter((r) => now - r.ts < 300_000);
  const pulse = {
    perMin: lastMin.length,
    last5: last5.length,
    refused5: last5.filter((r) => r.decision === 'BLOCKED').length,
    held5: last5.filter((r) => r.decision === 'NEEDS_APPROVAL').length,
    online: lives.reduce((s, l) => s + Object.values(l.runtimes).filter((r) => now - r.lastSeen < 30_000).length, 0),
    connected: worlds.filter((w) => conn(w).status === 'connected').length,
    p95_5m: pct(last5.map((r) => r.perf?.gatewayMs).filter((x): x is number => typeof x === 'number'), 95),
  };
  const approvers = Object.values(phones.approvers).map((a) => ({ name: a.name, online: now - a.lastSeen < 60_000, push: a.push, device: a.device }));
  return json({ now, llm: llmAvailable(), overall: { bucketMs, points }, pulse, companies, sessions, pending, decided, feed, security, approvers });
}
