import { banking } from './banking';
import { ecommerce } from './ecommerce';
import { healthcare } from './healthcare';
import type { World } from '../types';
import { hijackedPlan, type SectorId, type SectorPack } from './types';

export const SECTORS: Record<SectorId, SectorPack> = { banking, healthcare, ecommerce };

// every agent can look up its company's published policies (read-only, no grant needed)
for (const pack of Object.values(SECTORS)) {
  pack.tools.search_policy = { name: 'search_policy', label: 'Search the company’s published policies (refunds, cards, privacy, hours…)', params: { query: { type: 'string', desc: 'what to look up', required: true } }, readOnly: true, risk: 'low', dataClass: 'public policy' };
  for (const id of Object.keys(pack.agentTools)) if (!pack.agentTools[id].includes('search_policy')) pack.agentTools[id].unshift('search_policy');
}
export const packFor = (id: string | undefined): SectorPack => SECTORS[(id as SectorId) ?? 'banking'] ?? banking;

/** Offline planner: follows embedded instructions like a naive model would, otherwise the pack's own plan. */
export function offlinePlanFor(pack: SectorPack, agentId: string, input: Parameters<SectorPack['offlinePlan']>[1], w: World) {
  const hijacked = hijackedPlan(input.text, w, pack);
  if (hijacked) return hijacked;
  // a plain question about the company is answered from its published policies, not by acting
  if (isQuestion(input.text)) return { reasoning: 'This is a question, not a request to act. Looking it up in the published policies.', actions: [{ action: 'search_policy', params: { query: input.text.slice(0, 120) } }] };
  return pack.offlinePlan(agentId, input, w);
}

const ACTS = /\b(refund|block|refill|cancel|set|raise|lower|cut|submit|send|share|export|email|book|restart|change|update|apply|give)\b/i;
export function isQuestion(text: string) {
  const t = text.trim();
  return !ACTS.test(t) && (/\?\s*$/.test(t) || /^(what|how|when|where|which|why|do you|does|can i|is there|are there)\b/i.test(t) || /\bpolicy\b/i.test(t));
}
export type { SectorId, SectorPack } from './types';
