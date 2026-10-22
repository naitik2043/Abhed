import { adminKeyFor } from './agentapi';
import { appendLedger } from './engine';
import { keyFor } from './live';
import { packFor } from './sectors';
import { resetGateway } from './gateway';
import { getDoc, getWorld, isTenant, mutate, mutateLive, mutateShared, resetWorld, TENANTS, type Tenant } from './store';
import type { Connection, World } from './types';

/**
 * Companies join Abhed live.
 * Abhed issues a one-time pairing code that belongs to no company yet. A company's website redeems it and
 * says who it is (name, industry, its agents). Abhed then creates the company fresh, applies its deterministic
 * industry rulebook, hands over the agent keys, and starts monitoring. Until then the company exists nowhere
 * in Abhed. Removing it wipes it and refuses its keys again (fail-closed).
 */
export const CODE_TTL_MS = 10 * 60_000;
export const ONLINE_MS = 30_000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REGISTRY = 'connect';

type Note = Connection['timeline'][number];
export interface Registry {
  version: number;
  code: string | null;
  exp: number | null;
  log: (Note & { tenant?: string })[];
}
const emptyRegistry = (): Registry => ({ version: 0, code: null, exp: null, log: [] });

const LEGACY_SITE_URLS: Record<string, string> = {
  'https://novabank-agents.onrender.com': 'https://abhed-novabank.onrender.com',
  'https://sanjeevani-agents.onrender.com': 'https://abhed-sanjeevani.onrender.com',
  'https://bazaar-agents.onrender.com': 'https://abhed-bazaar.onrender.com',
};

export const conn = (w: World): Connection => {
  const connection: Connection = w.connection ?? { status: 'connected', timeline: [] };
  const site = connection.site;
  const savedUrl = site ? (site.url.endsWith('/') ? site.url.slice(0, -1) : site.url) : '';
  const currentUrl = site && LEGACY_SITE_URLS[savedUrl];
  return currentUrl && site ? { ...connection, site: { ...site, url: currentUrl } } : connection;
};
export const isVisible = (w: World) => conn(w).status === 'connected';
const note = (list: Note[], text: string, tone: Note['tone'] = 'info', at = Date.now()) => {
  list.push({ at, text, tone });
  if (list.length > 40) list.splice(0, list.length - 40);
};
const record = (w: World, action: string, reason: string, params: Record<string, unknown> = {}) =>
  appendLedger(w, { actorType: 'system', actorId: 'abhed-connect', actorName: 'Abhed · Connect', action, params, decision: 'INFO', reason });
const company = (t: string) => packFor(t).company.replace(' (fictional)', '');

export function newCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export const getRegistry = () => getDoc<Registry>(REGISTRY, emptyRegistry);

/** A new one-time code; any website may redeem it once, within 10 minutes. */
export async function issueCode(now = Date.now()) {
  const { result } = await mutateShared<Registry, string>(REGISTRY, emptyRegistry, (r) => {
    r.code = newCode();
    r.exp = now + CODE_TTL_MS;
    note(r.log, 'Pairing code issued, valid for 10 minutes', 'info', now);
    return r.code;
  });
  return result;
}

/** All companies currently in Abhed (connected). */
export async function activeWorlds() {
  const worlds = await Promise.all(TENANTS.map((t) => getWorld(t)));
  return worlds.filter(isVisible);
}

/** The website redeems the code and introduces itself. */
export async function pair(code: string, site: { url: string; name: string; sector: string; agents?: { id: string; name: string }[] }) {
  const want = code.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(want)) return { ok: false as const, status: 400, error: 'A pairing code is 6 letters and digits.' };
  if (!isTenant(site.sector)) return { ok: false as const, status: 400, error: `Abhed has no rulebook for the industry “${site.sector}” yet.` };
  const t = site.sector;
  // claim the code atomically so it works exactly once
  const { result: claim } = await mutateShared<Registry, 'ok' | 'expired' | 'unknown'>(REGISTRY, emptyRegistry, (r) => {
    if (!r.code || r.code !== want) return 'unknown';
    if ((r.exp ?? 0) < Date.now()) return 'expired';
    r.code = null;
    r.exp = null;
    return 'ok';
  });
  if (claim === 'expired') return { ok: false as const, status: 410, error: 'This code has expired. Generate a new one in Abhed → Connect.' };
  if (claim === 'unknown') return { ok: false as const, status: 404, error: 'Abhed is not waiting for this code. Check it on Abhed → Connect.' };

  const pack = packFor(t);
  const was = conn(await getWorld(t)).status;
  // a company that was not in Abhed starts fresh: nothing about it existed before this moment
  if (was !== 'connected') await resetWorld({ tenant: t, history: false });
  const declared = (site.agents ?? []).map((a) => a.id).filter((id) => id in pack.agentTools);
  const { result } = await mutate((w) => {
    const now = Date.now();
    const c: Connection = (w.connection = { status: 'connected', since: now, seen: {}, timeline: was === 'connected' ? conn(w).timeline : [] });
    if (declared.length) c.agents = declared;
    c.site = { url: site.url.slice(0, 120), name: (site.name || company(t)).slice(0, 60), at: now };
    note(c.timeline, `${c.site.name} joined Abhed from ${c.site.url}`, 'ok', now);
    note(c.timeline, `Abhed’s ${pack.label.toLowerCase()} rulebook applied: ${w.rules.filter((r) => r.active).length} deterministic rules`, 'info', now);
    const r = record(w, 'connect_site', `${c.site.name} connected to Abhed from ${c.site.url} with a one-time pairing code. Industry rulebook applied; every action of its agents is governed from this record on.`, { site: c.site.url });
    return { seq: r.seq, name: c.site.name };
  }, t);
  await mutateShared<Registry, void>(REGISTRY, emptyRegistry, (r) => void note(r.log, `${result.name} joined from ${site.url}`, 'ok'));
  const keys = Object.fromEntries(Object.keys(pack.agentTools).map((id) => [id, keyFor(id)]));
  forgetConnection(t);
  return { ok: true as const, tenant: t, company: result.name, keys, adminKey: adminKeyFor(t), record: result.seq };
}

/** Delete a company from Abhed: its data is wiped and its keys are refused until it pairs again. */
export async function removeCompany(t: Tenant, by = 'the Abhed operator') {
  const name = conn(await getWorld(t)).site?.name ?? company(t);
  await resetWorld({ tenant: t, history: false });
  await mutate((w) => {
    w.connection = { status: 'removed', timeline: [] };
  }, t);
  await mutateShared<Registry, void>(REGISTRY, emptyRegistry, (r) => void note(r.log, `${name} removed by ${by}`, 'warn'));
  forgetConnection(t);
}

/** Back to the opening state: only NovaBank, no pending code. */
export async function resetDemo() {
  for (const t of TENANTS) await resetWorld({ tenant: t });
  await resetGateway();
  await mutateShared<Registry, void>(REGISTRY, emptyRegistry, (r) => {
    r.code = null;
    r.exp = null;
    r.log = [];
    note(r.log, 'Demo reset: only NovaBank is connected', 'info');
  });
  for (const t of TENANTS) forgetConnection(t);
}

/** Website heartbeat for one agent: shows it online; the first one after joining is noted. */
export async function heartbeat(tenant: Tenant, agentId: string, site: string) {
  const now = Date.now();
  await mutateLive((l) => {
    const cur = l.runtimes[agentId];
    l.runtimes[agentId] = {
      agentId,
      host: site.slice(0, 40) || 'website',
      pid: 0,
      runtime: 'website',
      startedAt: cur?.startedAt ?? now,
      lastSeen: now,
      task: cur?.task,
      lastThought: cur?.lastThought,
      lastDecision: cur?.lastDecision,
      model: cur?.model,
      tokensToday: cur?.tokensToday ?? 0,
      llmCostToday: cur?.llmCostToday ?? 0,
      calls: cur?.calls ?? 0,
    };
  }, tenant);
  const w0 = await getWorld(tenant);
  if (conn(w0).seen?.[agentId]) return;
  await mutate((w) => {
    const c = (w.connection = conn(w));
    c.seen ??= {};
    if (c.seen[agentId]) return;
    c.seen[agentId] = now;
    const a = w.agents.find((x) => x.id === agentId);
    note(c.timeline, `${a?.name ?? agentId} came online on ${site || 'the website'}`, 'ok', now);
  }, tenant);
}

// instance-local cache so every agent call doesn't reload the world just to check the link
const cache = new Map<string, { status: Connection['status']; at: number }>();
export async function isConnected(tenant: Tenant) {
  const hit = cache.get(tenant);
  if (hit && Date.now() - hit.at < 3000) return hit.status === 'connected';
  const status = conn(await getWorld(tenant)).status;
  cache.set(tenant, { status, at: Date.now() });
  return status === 'connected';
}
export const forgetConnection = (tenant: string) => cache.delete(tenant);
