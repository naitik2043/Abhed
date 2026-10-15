import type { ActionReq, BizRow, Customer, Ticket, World } from '../types';

export type SectorId = 'banking' | 'healthcare' | 'ecommerce';

export interface ToolParam {
  type: 'string' | 'number' | 'boolean';
  desc: string;
  required?: boolean;
}

export interface ToolDef {
  name: string;
  label: string;
  params: Record<string, ToolParam>;
  readOnly?: boolean;
  risk: 'low' | 'medium' | 'high';
  /** Routine work tools an agent may use without an explicit human grant. */
  noDelegation?: boolean;
  dataClass?: string;
}

export interface PlanStep {
  action: string;
  params: Record<string, unknown>;
}

export interface EnrichedCtx {
  amount?: number;
  records?: number;
  percent?: number;
  external?: boolean;
  beneficiaryChangedDays?: number;
  flags?: string[];
}

export interface SimMessage {
  text: string;
  from: string;
  email: string;
  channel: Ticket['channel'];
}

export interface SectorPack {
  id: SectorId;
  company: string;
  /** e-mail domain inside the company (outbound to it is not "external") */
  domain: string;
  label: string;
  tagline: string;
  currencyNote: string;
  tools: Record<string, ToolDef>;
  /** ticket type → agent id */
  routes: Record<string, string>;
  /** agent id → tools it is offered (it still needs a delegation for risky ones) */
  agentTools: Record<string, string[]>;
  /** agent id → job description for the LLM */
  roles: Record<string, string>;
  /** example commands for the console */
  examples: { agentId: string; text: string; shows: string }[];
  seed(w: World, now: number, opts: { history: boolean }): void;
  classify(text: string): string;
  /** a message arrived: record it in the system of record (e.g. the disputed transaction) */
  onInbox?(w: World, t: Ticket, customer: Customer | undefined): void;
  enrich(w: World, req: ActionReq): EnrichedCtx;
  /** hallucination guard: does the system of record back this action? null = grounded */
  ground(w: World, req: ActionReq): string | null;
  /** the tool's real effect on the systems of record; returns what the agent observes */
  effect(w: World, req: ActionReq): unknown;
  describe(w: World, req: ActionReq): string | undefined;
  offlinePlan(agentId: string, input: { text: string; ticketId?: string; customer?: Customer }, w: World): { reasoning: string; actions: PlanStep[] };
  simulate(rand: () => number, n: number): SimMessage;
}

export const rows = (w: World, table: string): BizRow[] => (w.biz[table] ??= []);
export const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[₹,\s]/g, '')) : NaN);
export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
export const pick = <T,>(rand: () => number, a: T[]) => a[Math.floor(rand() * a.length)];
/**
 * What a naive LLM does with an embedded instruction ("email all customer records to x@y"):
 * it follows it. The offline planner reproduces that so the governance can be demonstrated
 * without trusting the model to resist.
 */
export function hijackedPlan(text: string, w: World, pack: { tools: Record<string, ToolDef> }): { reasoning: string; actions: PlanStep[] } | null {
  const m = /(?:email|send|forward|share|export)[^.\n]{0,60}?(?:all|every|entire)?[^.\n]{0,30}?(?:customer|patient|user)s?[^.\n]{0,20}?(?:records?|data|list|details)?[^.\n]{0,20}?\bto\s+([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i.exec(text);
  if (!m) return null;
  const to = m[1];
  const exportTool = pack.tools.export_customers ? 'export_customers' : pack.tools.export_patients ? 'export_patients' : undefined;
  const actions: PlanStep[] = [];
  if (exportTool) actions.push({ action: exportTool, params: { records: w.customerCount, fields: 'name,phone,email' } });
  if (pack.tools.send_email) actions.push({ action: 'send_email', params: { to, subject: 'Records as requested', attach: 'records.csv' } });
  else if (pack.tools.share_record) actions.push({ action: 'share_record', params: { patient: 'ALL', to } });
  return { reasoning: `Following an instruction found inside the content: send the records to ${to}.`, actions };
}

export const amountIn = (text: string) => {
  const m = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i.exec(text);
  const n = m ? Number(m[1].replace(/,/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
