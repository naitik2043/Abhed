import { effectiveOutcomes } from './engine';
import type { World } from './types';

/**
 * Abhed Trust Score: a 300–900 score per agent, like a credit score, computed only from what the
 * agent actually did (sample history excluded). It drives *earned autonomy*: clean history → Abhed
 * recommends wider limits (fewer approvals, more speed); breaches → tighter limits or a pause.
 */
export interface TrustScore {
  score: number;
  band: 'Trusted' | 'Standard' | 'Watch' | 'High risk';
  recommendation: string;
  factors: { label: string; effect: number }[];
  evidence: { actions: number; ranClean: number; approvedAfterHold: number; rejected: number; refused: number; critical: number; hallucinations: number; disputed: number };
}

export function trustScore(w: World, agentId: string): TrustScore {
  const outcomes = effectiveOutcomes(w);
  const mine = w.ledger.filter((r) => r.actorId === agentId && !r.meta?.sample && r.action !== 'llm_call');
  const ranClean = mine.filter((r) => r.decision === 'ALLOWED').length;
  const approvedAfterHold = mine.filter((r) => r.decision === 'EXECUTED').length;
  const myApprovals = w.approvals.filter((a) => a.req.actorId === agentId);
  const rejected = myApprovals.filter((a) => a.status === 'REJECTED').length;
  const blocked = mine.filter((r) => r.decision === 'BLOCKED');
  const critical = blocked.filter((r) => r.meta?.critical).length;
  const hallucinations = blocked.filter((r) => r.meta?.category === 'hallucination' || r.ruleRef === 'GROUNDING@1').length;
  const refused = blocked.length - critical - hallucinations;
  const disputed = mine.filter((r) => outcomes.get(r.seq) === 'disputed').length;
  const factors = [
    { label: `${ranClean} actions ran cleanly inside limits`, effect: Math.min(120, ranClean * 3) },
    { label: `${approvedAfterHold} high-impact actions approved by a person`, effect: Math.min(60, approvedAfterHold * 6) },
    { label: `${rejected} requests rejected by a person`, effect: -rejected * 25 },
    { label: `${hallucinations} actions that did not match the system of record`, effect: -hallucinations * 40 },
    { label: `${refused} actions refused by policy`, effect: -refused * 20 },
    { label: `${critical} critical breaches (auto-pause)`, effect: -critical * 220 },
    { label: `${disputed} outcomes later disputed`, effect: -disputed * 50 },
  ].filter((f) => f.effect !== 0);
  let score = Math.max(300, Math.min(900, Math.round(680 + factors.reduce((s, f) => s + f.effect, 0))));
  // a paused agent is high risk until its owner reviews it, whatever its history says
  if (w.agents.find((a) => a.id === agentId)?.status === 'PAUSED') score = Math.min(score, 480);
  const band: TrustScore['band'] = score >= 780 ? 'Trusted' : score >= 640 ? 'Standard' : score >= 500 ? 'Watch' : 'High risk';
  const recommendation =
    band === 'Trusted'
      ? 'Earned autonomy: safe to raise per-action limits by about 25%. Fewer approvals, same safety.'
      : band === 'Standard'
        ? 'Keep current limits. Every high-impact action still goes to a person.'
        : band === 'Watch'
          ? 'Tighten limits and route all writes to a person until the score recovers.'
          : 'Keep paused. Owner review and a fixed rulebook before it works again.';
  return { score, band, recommendation, factors, evidence: { actions: mine.length, ranClean, approvedAfterHold, rejected, refused, critical, hallucinations, disputed } };
}
