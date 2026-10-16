import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { tick } from './engine';
import { seedWorld } from './seed';
import { supabaseApiHeaders } from './supabase-headers';
import type { LiveDoc, World } from './types';

/**
 * State lives in one place so the laptop, the agents and the judge's phone always see the same world.
 * - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set → rows in Postgres (works on serverless).
 * - otherwise → process memory (local dev, tests, single-instance hosts).
 * Two documents: "main" (governance: registry, rules, approvals, ledger) and "live" (heartbeats, approver
 * phones, agent thoughts), so fast-changing runtime data never contends with ledger writes.
 * Writes use optimistic concurrency on `version`.
 */

type Doc = { version: number };

interface Backend {
  load<T extends Doc>(id: string): Promise<T | null>;
  save<T extends Doc>(id: string, doc: T, expectedVersion: number): Promise<boolean>;
}

const g = globalThis as unknown as { __kavachDocs?: Map<string, Doc> };
g.__kavachDocs ??= new Map();
// local snapshots (e.g. to screenshot real production data): ABHED_PRELOAD=/path/docs.json → { "main": {...}, ... }
if (process.env.ABHED_PRELOAD && !g.__kavachDocs.size) {
  try {
    const docs = JSON.parse(readFileSync(process.env.ABHED_PRELOAD, 'utf8')) as Record<string, Doc>;
    for (const [id, d] of Object.entries(docs)) g.__kavachDocs.set(id, d);
  } catch {
    /* no snapshot */
  }
}

const memory: Backend = {
  async load<T extends Doc>(id: string): Promise<T | null> {
    const d = g.__kavachDocs!.get(id);
    return d ? (structuredClone(d) as unknown as T) : null;
  },
  async save(id, doc, expected) {
    const cur = g.__kavachDocs!.get(id);
    if (cur && cur.version !== expected) return false;
    if (!cur && expected >= 0) return false;
    g.__kavachDocs!.set(id, structuredClone(doc));
    return true;
  },
};

function supabase(url: string, key: string, table: string): Backend {
  const headers = supabaseApiHeaders(key);
  return {
    async load<T extends Doc>(id: string): Promise<T | null> {
      const res = await fetch(`${url}/rest/v1/${table}?id=eq.${id}&select=world`, { headers, cache: 'no-store' });
      if (!res.ok) throw new Error(`state load ${res.status}`);
      const rows = (await res.json()) as { world: T }[];
      return rows[0]?.world ?? null;
    },
    async save(id, doc, expected) {
      if (expected < 0) {
        const res = await fetch(`${url}/rest/v1/${table}`, {
          method: 'POST',
          headers: { ...headers, prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ id, version: doc.version, world: doc, updated_at: new Date().toISOString() }),
        });
        return res.ok;
      }
      const res = await fetch(`${url}/rest/v1/${table}?id=eq.${id}&version=eq.${expected}&select=id`, {
        method: 'PATCH',
        headers: { ...headers, prefer: 'return=representation' },
        body: JSON.stringify({ version: doc.version, world: doc, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`state save ${res.status}`);
      const rows = (await res.json()) as unknown[];
      return rows.length === 1;
    },
  };
}

function backend(): Backend {
  const url = process.env.SUPABASE_URL;
  // Shared governance state is writable, so it must use a server-only key. The
  // publishable key is intentionally insufficient for this table.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return supabase(url.replace(/\/$/, ''), key, process.env.KAVACH_TABLE ?? 'kavach_state');
  return memory;
}

export const storeKind = () =>
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'postgres' : 'memory';

async function mutateDoc<D extends Doc, T>(id: string, init: () => D, fn: (d: D) => T, attempts = 8): Promise<{ doc: D; result: T }> {
  const b = backend();
  for (let attempt = 0; attempt < attempts; attempt++) {
    let d = await b.load<D>(id);
    let expected = d ? d.version : -1;
    if (!d) {
      d = init();
      expected = -1;
    }
    const result = fn(d);
    d.version = (expected < 0 ? 0 : expected) + 1;
    if (await b.save(id, d, expected)) return { doc: d, result };
    await new Promise((r) => setTimeout(r, 30 + Math.random() * (60 + attempt * 60)));
  }
  throw new Error('Busy: too many concurrent writes, try again');
}

/** Small shared documents outside any company (e.g. the pending pairing code). */
export async function getDoc<D extends Doc>(id: string, init: () => D): Promise<D> {
  return (await backend().load<D>(id)) ?? init();
}
export async function mutateShared<D extends Doc, T>(id: string, init: () => D, fn: (d: D) => T) {
  return mutateDoc<D, T>(id, init, fn);
}

// ───────── tenants: every company gets its own isolated governed world ─────────

export const TENANTS = ['banking', 'healthcare', 'ecommerce'] as const;
export type Tenant = (typeof TENANTS)[number];
export const isTenant = (t: unknown): t is Tenant => typeof t === 'string' && (TENANTS as readonly string[]).includes(t);
const als = new AsyncLocalStorage<Tenant>();

/** Run code (e.g. an agent call authenticated by key) against one tenant. */
export const withTenant = <T,>(t: Tenant, fn: () => T) => als.run(t, fn);

/** Explicit > async context > ?tenant / header / cookie of the current request > banking. */
export async function currentTenant(t?: string): Promise<Tenant> {
  if (isTenant(t)) return t;
  const ctx = als.getStore();
  if (ctx) return ctx;
  try {
    const { headers, cookies } = await import('next/headers');
    const h = await headers();
    const v = h.get('x-kavach-tenant') ?? (await cookies()).get('kv_tenant')?.value;
    if (isTenant(v)) return v;
  } catch {
    /* outside a request (tests, scripts) */
  }
  return 'banking';
}
const mainId = (t: Tenant) => (t === 'banking' ? 'main' : `main:${t}`);
const liveId = (t: Tenant) => (t === 'banking' ? 'live' : `live:${t}`);
const seedFor = (t: Tenant) => () => seedWorld(Date.now(), { sector: t });

// ───────── main: the governed world ─────────

export async function getWorld(tenant?: string): Promise<World> {
  const t = await currentTenant(tenant);
  const b = backend();
  let w = await b.load<World>(mainId(t));
  if (!w) {
    w = seedFor(t)();
    await b.save(mainId(t), w, -1);
  }
  // lazy clock for escalations / expiry
  const probe = structuredClone(w);
  if (tick(probe)) {
    return mutate((x) => {
      tick(x);
      return null;
    }, t).then((r) => r.world);
  }
  return w;
}

export async function mutate<T>(fn: (w: World) => T, tenant?: string): Promise<{ world: World; result: T }> {
  const t = await currentTenant(tenant);
  const { doc, result } = await mutateDoc<World, T>(mainId(t), seedFor(t), fn);
  return { world: doc, result };
}

export async function resetWorld(opts: { sector?: string; history?: boolean; tenant?: string } = {}): Promise<World> {
  const t = await currentTenant(opts.tenant ?? opts.sector);
  const { doc } = await mutateDoc<World, null>(mainId(t), seedFor(t), (w) => {
    const fresh = seedWorld(Date.now(), { sector: t, history: opts.history });
    for (const k of Object.keys(w)) delete (w as unknown as Record<string, unknown>)[k];
    Object.assign(w, fresh);
    return null;
  });
  await mutateLive((l) => {
    l.events = [];
    l.inboxCount = 0;
    for (const [k, r] of Object.entries(l.runtimes)) if (Date.now() - r.lastSeen > 30_000) delete l.runtimes[k];
    for (const r of Object.values(l.runtimes)) {
      r.tokensToday = 0;
      r.llmCostToday = 0;
      r.calls = 0;
      r.task = undefined;
      r.lastDecision = undefined;
      r.lastThought = undefined;
    }
    return null;
  }, t);
  return doc;
}

// ───────── live: heartbeats, approver phones, agent thoughts ─────────

export const emptyLive = (): LiveDoc => ({ version: 0, runtimes: {}, approvers: {}, events: [], inboxCount: 0 });

export async function getLive(tenant?: string): Promise<LiveDoc> {
  const t = await currentTenant(tenant);
  return (await backend().load<LiveDoc>(liveId(t))) ?? emptyLive();
}

export async function mutateLive<T>(fn: (l: LiveDoc) => T, tenant?: string) {
  const t = await currentTenant(tenant);
  return mutateDoc<LiveDoc, T>(liveId(t), emptyLive, fn);
}

export function liveEvent(l: LiveDoc, e: Omit<LiveDoc['events'][number], 'at'> & { at?: number }) {
  l.events.unshift({ at: e.at ?? Date.now(), agentId: e.agentId, kind: e.kind, text: e.text.slice(0, 220), tone: e.tone });
  if (l.events.length > 80) l.events.length = 80;
}
