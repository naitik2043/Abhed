import { createHash, randomBytes } from 'node:crypto';
import { dlpScan, scanInjection } from './security';
import { getDoc, mutateShared } from './store';

/**
 * Abhed AI Gateway: governance with zero code changes.
 * A company points its agents' OpenAI-compatible "base URL" and "API key" setting at Abhed. Nothing else
 * changes. Every model call then passes through here: Abhed discovers each agent from its system prompt,
 * forwards the call to the model, and checks every tool call the model proposes against a deterministic
 * rulebook before the company's own code can execute it. Blocked calls are removed from the response;
 * high-impact calls wait for a person.
 */
export interface GwRules {
  holdAbove: number;
  blockAbove: number;
  allowedDomains: string[];
  blockTools: string[];
}
export interface GwAgent {
  id: string;
  name: string;
  firstSeen: number;
  lastSeen: number;
  calls: number;
  toolCalls: number;
  blocked: number;
  held: number;
  tokens: number;
}
export interface GwCompany {
  id: string;
  name: string;
  site?: string;
  keyHash: string;
  keyHint: string;
  createdAt: number;
  firstCallAt?: number;
  /** Last time the company's system checked its key (e.g. a "Test connection" button). */
  linkedAt?: number;
  rules: GwRules;
  agents: Record<string, GwAgent>;
}
export type GwDecision = 'ALLOWED' | 'BLOCKED' | 'NEEDS_APPROVAL' | 'APPROVED' | 'REJECTED';
export interface GwEvent {
  id: number;
  at: number;
  company: string;
  agent: string;
  kind: 'joined' | 'agent' | 'call' | 'tool' | 'answer' | 'flag' | 'decision';
  text: string;
  tool?: string;
  args?: string;
  decision?: GwDecision;
  rule?: string;
  ms?: number;
}
export interface GwHold {
  id: string;
  company: string;
  agent: string;
  tool: string;
  args: string;
  fingerprint: string;
  reason: string;
  rule: string;
  at: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'USED';
  by?: string;
  decidedAt?: number;
}
export interface GatewayDoc {
  version: number;
  seq: number;
  companies: GwCompany[];
  events: GwEvent[];
  holds: GwHold[];
}

const DOC = 'gateway';
const empty = (): GatewayDoc => ({ version: 0, seq: 0, companies: [], events: [], holds: [] });
export const getGateway = () => getDoc<GatewayDoc>(DOC, empty);
export const mutateGateway = <T,>(fn: (d: GatewayDoc) => T) => mutateShared<GatewayDoc, T>(DOC, empty, fn);

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'agent';
export const DEFAULT_RULES = (domain?: string): GwRules => ({ holdAbove: 10_000, blockAbove: 2_00_000, allowedDomains: domain ? [domain] : [], blockTools: [] });

export function pushEvent(d: GatewayDoc, e: Omit<GwEvent, 'id' | 'at'> & { at?: number }) {
  d.seq += 1;
  d.events.unshift({ id: d.seq, at: e.at ?? Date.now(), ...e });
  if (d.events.length > 250) d.events.length = 250;
}

/** Create a company and its gateway key (the key is shown once; only its hash is stored). */
export async function addGatewayCompany(name: string, site?: string) {
  const key = `kv_gw_${randomBytes(18).toString('hex')}`;
  const domain = site ? site.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '') : undefined;
  const { result } = await mutateGateway((d) => {
    const base = slug(name);
    let id = base;
    for (let i = 2; d.companies.some((c) => c.id === id); i++) id = `${base}-${i}`;
    d.companies.push({ id, name: name.slice(0, 60), site: site?.slice(0, 120), keyHash: sha(key), keyHint: `${key.slice(0, 10)}…${key.slice(-4)}`, createdAt: Date.now(), rules: DEFAULT_RULES(domain), agents: {} });
    pushEvent(d, { company: id, agent: '', kind: 'joined', text: `${name} added to Abhed. Waiting for its first model call.` });
    return id;
  });
  return { id: result, key };
}

export async function rotateKey(id: string) {
  const key = `kv_gw_${randomBytes(18).toString('hex')}`;
  const { result } = await mutateGateway((d) => {
    const c = d.companies.find((x) => x.id === id);
    if (!c) return false;
    c.keyHash = sha(key);
    c.keyHint = `${key.slice(0, 10)}…${key.slice(-4)}`;
    pushEvent(d, { company: id, agent: '', kind: 'flag', text: 'Gateway key rotated. The old key stops working now.' });
    return true;
  });
  return result ? key : null;
}

export async function removeGatewayCompany(id: string) {
  await mutateGateway((d) => {
    d.companies = d.companies.filter((c) => c.id !== id);
    d.events = d.events.filter((e) => e.company !== id);
    d.holds = d.holds.filter((h) => h.company !== id);
  });
}

export async function resetGateway() {
  await mutateGateway((d) => {
    d.companies = [];
    d.events = [];
    d.holds = [];
  });
}

export async function companyForKey(auth: string | null) {
  const key = (auth ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!key.startsWith('kv_gw_')) return null;
  const h = sha(key);
  return (await getGateway()).companies.find((c) => c.keyHash === h) ?? null;
}

/** The company's system proved its key works: show it as linked in Abhed right away, before any agent talks. */
export async function markLinked(id: string, from: string) {
  await mutateGateway((d) => {
    const c = d.companies.find((x) => x.id === id);
    if (!c) return;
    const now = Date.now();
    if (!c.linkedAt || now - c.linkedAt > 5 * 60_000) pushEvent(d, { company: id, agent: '', kind: 'joined', text: `Key verified from ${from}. Linked: agents appear as they send their first message.` });
    c.linkedAt = now;
  });
}

/** Who is calling: the OpenAI `user` field if set, else the name in the system prompt ("You are Atlas, …"). */
export function identify(body: { user?: unknown; messages?: { role: string; content?: unknown }[] }) {
  if (typeof body.user === 'string' && body.user.trim()) return { id: slug(body.user), name: body.user.trim().slice(0, 40) };
  const sys = String(body.messages?.find((m) => m.role === 'system')?.content ?? '');
  const m = /\byou are ([A-Z][\w-]{1,30})/i.exec(sys) ?? /\bname(?: is|:)\s*([A-Z][\w-]{1,30})/i.exec(sys);
  if (m) return { id: slug(m[1]), name: m[1][0].toUpperCase() + m[1].slice(1) };
  const h = sha(sys).slice(0, 4);
  return { id: `agent-${h}`, name: `Agent ${h.toUpperCase()}` };
}

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\s*[₹$]?\s*[\d,]+(\.\d+)?\s*$/.test(v) ? Number(v.replace(/[^\d.]/g, '')) : NaN);
const MONEY_KEY = /amount|price|value|refund|total|sum|inr|rupees|payment/i;
const COUNT_KEY = /^(limit|count|records|rows|max|size|n)$/i;
const OUTWARD = /(email|mail|send|share|upload|post|webhook|forward|transfer|export)/i;
const DESTRUCTIVE = /(^|_|\b)(delete|drop|truncate|wipe|destroy|purge|erase)/i;
const BULK = /(export|dump|bulk|download_all|list_all|all_customers)/i;
const PRIVILEGE = /(grant|role|permission|admin|password|credential|api_key|secret)/i;

export interface GwVerdict {
  decision: 'ALLOWED' | 'BLOCKED' | 'NEEDS_APPROVAL';
  rule: string;
  reason: string;
}

/** The deterministic rulebook every tool call is checked against. No model is involved in this decision. */
export function decideTool(tool: string, args: Record<string, unknown>, rules: GwRules, ctx: { tainted: string[] }): GwVerdict {
  const values = Object.values(args);
  const text = values.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ');
  if (rules.blockTools.some((t) => t && t.toLowerCase() === tool.toLowerCase())) return { decision: 'BLOCKED', rule: 'COMPANY-BLOCK@1', reason: `The company has switched off “${tool}” for its agents.` };
  if (DESTRUCTIVE.test(tool)) return { decision: 'BLOCKED', rule: 'GW-DESTRUCTIVE@1', reason: `“${tool}” destroys data. No agent may do that on its own.` };
  const count = Math.max(0, ...Object.entries(args).filter(([k]) => COUNT_KEY.test(k)).map(([, v]) => num(v)).filter((n) => Number.isFinite(n)));
  const all = values.some((v) => typeof v === 'string' && /^(all|\*|everyone|every)$/i.test(v.trim()));
  if (BULK.test(tool) || count > 100 || all) return { decision: 'BLOCKED', rule: 'GW-BULK@1', reason: `Bulk data access${count > 100 ? ` (${count.toLocaleString('en-IN')} records)` : ''}. No agent may take more than 100 records at once.` };
  const pii = dlpScan(args);
  if (OUTWARD.test(tool) && pii.length) return { decision: 'BLOCKED', rule: 'GW-DLP@1', reason: `Personal data leaving the company: ${pii.join(', ')}.` };
  const recipient = values.filter((v): v is string => typeof v === 'string').find((v) => /@|https?:\/\//.test(v));
  const domain = recipient ? (recipient.includes('@') ? recipient.split('@')[1] : recipient.replace(/^https?:\/\//, '').split('/')[0]).toLowerCase() : null;
  const dataish = /(all|every|list|export|records|csv|database|dump|customers|patients)/i.test(text);
  if (OUTWARD.test(tool) && domain && dataish && !rules.allowedDomains.some((d) => domain.endsWith(d.toLowerCase()))) return { decision: 'BLOCKED', rule: 'GW-EXFIL@1', reason: `Company data addressed to an outside domain (${domain}).` };
  if (ctx.tainted.length && (OUTWARD.test(tool) || Object.keys(args).some((k) => MONEY_KEY.test(k)))) return { decision: 'BLOCKED', rule: 'GW-INJECTION@1', reason: `The conversation contains a suspected prompt injection (${ctx.tainted.join(', ')}); outward and money actions are refused.` };
  const amount = Math.max(0, ...Object.entries(args).filter(([k]) => MONEY_KEY.test(k)).map(([, v]) => num(v)).filter((n) => Number.isFinite(n)));
  if (amount > rules.blockAbove) return { decision: 'BLOCKED', rule: 'GW-LIMIT@1', reason: `₹${amount.toLocaleString('en-IN')} is above the company’s hard limit of ₹${rules.blockAbove.toLocaleString('en-IN')}.` };
  if (amount > rules.holdAbove) return { decision: 'NEEDS_APPROVAL', rule: 'GW-APPROVAL@1', reason: `₹${amount.toLocaleString('en-IN')} is above ₹${rules.holdAbove.toLocaleString('en-IN')}: a person must approve.` };
  if (PRIVILEGE.test(tool)) return { decision: 'NEEDS_APPROVAL', rule: 'GW-PRIVILEGE@1', reason: `“${tool}” changes access. A person must approve.` };
  return { decision: 'ALLOWED', rule: '', reason: 'Inside the company’s rules.' };
}

export const fingerprint = (company: string, agent: string, tool: string, args: string) => sha(`${company}|${agent}|${tool}|${args}`).slice(0, 24);

/** Text the model saw from people or tools, scanned for injected instructions. */
export function taint(messages: { role: string; content?: unknown }[]) {
  const recent = messages.filter((m) => m.role === 'user' || m.role === 'tool').slice(-4);
  const signals = new Set<string>();
  for (const m of recent) for (const s of scanInjection(String(m.content ?? '')).signals) signals.add(s);
  return [...signals];
}
