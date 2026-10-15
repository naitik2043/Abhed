import { verifyChain } from './chain';
import { verifyLedger } from './engine';
import type { World } from './types';

/**
 * Compliance evidence pack: each control Abhed enforces, the clause it answers, and live evidence
 * counted from this company's ledger. Mapping is Abhed's reading of each framework, not legal advice.
 */
export function complianceEvidence(w: World) {
  const L = w.ledger.filter((r) => !r.meta?.sample);
  const count = (f: (r: (typeof L)[number]) => boolean) => L.filter(f).length;
  const decided = w.approvals.filter((a) => a.votes.length);
  const lv = verifyLedger(w);
  const cv = verifyChain(w);
  const anchored = (w.blocks ?? []).filter((b) => b.anchor?.status === 'submitted').length;
  const sec = w.security ?? [];
  return [
    { framework: 'EU AI Act · Art. 12', control: 'Automatic record-keeping of every agent action', evidence: `${L.length} hash-chained records · chain ${lv.valid ? 'valid' : 'BROKEN'} · ${cv.blocks} signed blocks, ${anchored} anchored to Bitcoin` },
    { framework: 'EU AI Act · Art. 14', control: 'Human oversight: a person can approve, reject, or stop the system', evidence: `${decided.length} decisions by named people · ${count((r) => r.action === 'pause_agent')} pauses · ${w.oversight.length} rubber-stamp flags` },
    { framework: 'DPDP Act 2023 (India)', control: 'Personal data used only for the stated purpose; no unconsented sharing', evidence: `${count((r) => r.ruleRef === 'DLP@1')} outbound leaks blocked by DLP · ${count((r) => r.ruleRef === 'SCOPE@1')} cross-customer actions refused · ${count((r) => /export/.test(r.action) && r.decision === 'BLOCKED')} bulk exports refused` },
    { framework: 'RBI FREE-AI (Aug 2025)', control: 'AI inventory, accountability, audit trail and incident reporting', evidence: `${w.agents.length} agents registered with named owners · ${w.incidents.length} incidents with an accountability chain · one-click audit report` },
    { framework: 'OWASP ASI01 Goal hijack', control: 'Prompt-injection scanning; tainted sessions cannot send data out', evidence: `${sec.filter((s) => s.owasp.startsWith('ASI01')).length} injection events flagged` },
    { framework: 'OWASP ASI02/03 Tool & privilege misuse', control: 'Delegated, capped authority per agent; session scoped to one customer', evidence: `${sec.filter((s) => /ASI0[23]/.test(s.owasp)).length} misuse events · ${count((r) => r.reason.startsWith('No human delegated'))} undelegated calls refused` },
    { framework: 'OWASP LLM09 Misinformation', control: 'Grounding: amounts, ids, drugs and prices checked against systems of record', evidence: `${count((r) => r.ruleRef === 'GROUNDING@1')} hallucinated actions stopped` },
    { framework: 'OWASP ASI10 Rogue agents', control: 'Critical breach → automatic pause and key revocation; unregistered agents fail closed', evidence: `${count((r) => r.decision === 'BLOCKED' && Boolean(r.meta?.critical))} critical breaches · ${w.unregistered.length} shadow agents refused` },
  ];
}
