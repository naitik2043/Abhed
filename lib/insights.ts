import { verifyChain } from './chain';
import { agent, effectiveOutcomes, nameOf, verifyLedger } from './engine';
import { packFor } from './sectors';
import { trustScore } from './trust';
import type { LedgerRecord, World } from './types';

const pct = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const round = (n: number | null, d = 2) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

/**
 * Everything here is computed from the ledger and the approvals. Sample history (seeded records,
 * meta.sample) is excluded, so the numbers are only what agents really did on this deployment.
 */
export function buildInsights(w: World, now = Date.now()) {
  const pack = packFor(w.sector);
  const real = w.ledger.filter((r) => !r.meta?.sample);
  const acts = real.filter((r) => r.actorType === 'agent' && r.action !== 'llm_call' && ['ALLOWED', 'NEEDS_APPROVAL', 'BLOCKED', 'EXECUTED'].includes(r.decision) && !r.approvers.length);
  const timed = acts.filter((r) => typeof r.perf?.gatewayMs === 'number');
  const ms = timed.map((r) => r.perf!.gatewayMs!);
  const auto = acts.filter((r) => r.decision === 'ALLOWED');
  const held = acts.filter((r) => r.decision === 'NEEDS_APPROVAL');
  const blocked = acts.filter((r) => r.decision === 'BLOCKED');

  // human checkpoints: how long people took, and why they were asked
  const decided = w.approvals.filter((a) => a.votes.length && !a.req.params?.sample);
  const waitS = decided.map((a) => (a.votes[a.votes.length - 1].at - a.createdAt) / 1000);
  const reasons = new Map<string, { rule: string; says: string; count: number }>();
  for (const a of w.approvals) {
    const key = a.ruleIds[0] ?? 'DELEGATION-LIMIT';
    const rule = w.rules.find((r) => `${r.id}@${r.version}` === key);
    const cur = reasons.get(key) ?? { rule: key, says: rule?.says ?? (a.why || 'Above the limit a person delegated to the agent'), count: 0 };
    cur.count += 1;
    reasons.set(key, cur);
  }
  const blockReasons = new Map<string, number>();
  for (const r of blocked) {
    const k = (r.meta?.category as string) ?? r.perf?.category ?? (r.ruleRef ? 'policy' : 'delegation');
    blockReasons.set(k, (blockReasons.get(k) ?? 0) + 1);
  }

  // time series: last 60 minutes in 2-minute buckets (falls back to 24 h hourly if nothing recent)
  const recent = acts.filter((r) => now - r.ts < 3_600_000);
  const hourly = recent.length < 3;
  const bucketMs = hourly ? 3_600_000 : 120_000;
  const n = hourly ? 24 : 30;
  const series = Array.from({ length: n }, (_, i) => {
    const start = now - (n - i) * bucketMs;
    const rows = acts.filter((r) => r.ts >= start && r.ts < start + bucketMs);
    const t = rows.filter((r) => typeof r.perf?.gatewayMs === 'number').map((r) => r.perf!.gatewayMs!);
    return {
      t: start,
      auto: rows.filter((r) => r.decision === 'ALLOWED').length,
      held: rows.filter((r) => r.decision === 'NEEDS_APPROVAL').length,
      blocked: rows.filter((r) => r.decision === 'BLOCKED').length,
      p95ms: round(pct(t, 95)),
    };
  });

  // per agent: usage, cost, value, risk
  const outcomes = effectiveOutcomes(w);
  const agents = w.agents.map((a) => {
    const mine = real.filter((r) => r.actorId === a.id);
    const work = mine.filter((r) => r.action !== 'llm_call');
    const llm = mine.filter((r) => r.action === 'llm_call');
    const ok = work.filter((r) => (r.decision === 'ALLOWED' || r.decision === 'EXECUTED') && outcomes.get(r.seq) !== 'disputed');
    const crit = work.filter((r) => r.decision === 'BLOCKED' && r.meta?.critical).length;
    const blockedN = work.filter((r) => r.decision === 'BLOCKED').length;
    return {
      id: a.id,
      name: a.name,
      owner: nameOf(w, a.owner),
      status: a.status,
      actions: work.length,
      auto: work.filter((r) => r.decision === 'ALLOWED').length,
      held: work.filter((r) => r.decision === 'NEEDS_APPROVAL').length,
      blocked: blockedN,
      critical: crit,
      llmCalls: llm.length,
      tokens: llm.reduce((s, r) => s + Number(r.params.tokens ?? 0), 0),
      costInr: Math.round([...work, ...llm].reduce((s, r) => s + (r.cost ?? 0), 0) * 100) / 100,
      valueInr: ok.reduce((s, r) => s + Number(r.meta?.value ?? 0), 0),
      riskScore: Math.min(100, crit * 40 + blockedN * 8 + (a.risk === 'HIGH' ? 20 : a.risk === 'MEDIUM' ? 10 : 0)),
      trust: (({ score, band, recommendation }) => ({ score, band, recommendation }))(trustScore(w, a.id)),
    };
  });

  // accountability chain for every high-impact action that ran after a person approved it
  const chains = w.approvals
    .filter((a) => a.status === 'EXECUTED' && a.executedSeq)
    .slice(-12)
    .reverse()
    .map((ap) => {
      const ag = agent(w, ap.req.actorId);
      const exec = w.ledger.find((r) => r.seq === ap.executedSeq);
      const block = (w.blocks ?? []).find((b) => ap.executedSeq! >= b.fromSeq && ap.executedSeq! <= b.toSeq);
      return {
        approvalId: ap.id,
        summary: ap.summary,
        agent: ag?.name ?? nameOf(w, ap.req.actorId),
        owner: ag ? nameOf(w, ag.owner) : undefined,
        rule: ap.ruleIds.join(', ') || 'delegation limit',
        approvers: ap.votes.map((v) => ({ name: v.name, device: v.device, seconds: Math.round(v.decisionMs / 100) / 10, evidence: v.evidenceViewed, at: v.at })),
        executedSeq: ap.executedSeq,
        recordHash: exec?.hash,
        block: block ? { height: block.height, hash: block.hash, anchor: block.anchor?.status } : null,
      };
    });

  const totalDecided = auto.length + held.length + blocked.length;
  return {
    sector: { id: pack.id, company: pack.company },
    now,
    sampleExcluded: w.ledger.length - real.length,
    speed: {
      measured: ms.length,
      p50ms: round(pct(ms, 50)),
      p95ms: round(pct(ms, 95)),
      p99ms: round(pct(ms, 99)),
      maxms: round(ms.length ? Math.max(...ms) : null),
    },
    mix: {
      total: totalDecided,
      auto: auto.length,
      held: held.length,
      blocked: blocked.length,
      autoPct: totalDecided ? Math.round((auto.length / totalDecided) * 1000) / 10 : null,
      heldPct: totalDecided ? Math.round((held.length / totalDecided) * 1000) / 10 : null,
    },
    human: {
      decided: decided.length,
      pending: w.approvals.filter((a) => a.status === 'PENDING').length,
      medianWaitS: round(pct(waitS, 50), 1),
      p95WaitS: round(pct(waitS, 95), 1),
      rubberStamps: w.oversight.length,
    },
    reasons: [...reasons.values()].sort((a, b) => b.count - a.count),
    blockReasons: [...blockReasons.entries()].map(([k, v]) => ({ category: k, count: v })).sort((a, b) => b.count - a.count),
    series: { bucketMs, points: series },
    agents,
    chains,
    security: (w.security ?? []).slice(0, 40),
    integrity: { ledger: verifyLedger(w), chain: verifyChain(w) },
  };
}

export type Insights = ReturnType<typeof buildInsights>;
export type { LedgerRecord };
