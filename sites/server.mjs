import { createServer } from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { adminPage } from './admin.mjs';
import { Abhed } from './abhed-sdk.mjs';
import { runAgent } from './agent.mjs';
import { SITES } from './sites.mjs';
import { page } from './page.mjs';

/**
 * A company website with its own AI agents. The agents are this company's code; they plug into
 * Abhed with one key each and the SDK in abhed-sdk.mjs. Keys come either from env
 * (ABHED_KEYS = {"agentId":"kv_live_…"}) or live, from a one-time pairing code entered in /admin.
 */
// SITE=zentro runs the separate Zentro Logistics website (no Abhed SDK) on the same kind of service
if (process.env.SITE === 'zentro') {
  await import('./zentro/server.mjs');
} else {
  await startSite();
}

async function startSite() {
const SITE = SITES[process.env.SITE ?? 'novabank'];
if (!SITE) throw new Error(`Unknown SITE ${process.env.SITE}`);
const ABHED_URL = (process.env.ABHED_URL ?? process.env.KAVACH_URL ?? 'https://abhed.vercel.app').replace(/\/$/, '');
const PORT = Number(process.env.PORT ?? 4000);
const PUBLIC_URL = (process.env.RENDER_EXTERNAL_URL ?? process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '');
const ADMIN_PIN = process.env.ADMIN_PIN ?? '2468';
const STATE_FILE = process.env.ABHED_STATE_FILE ?? `/tmp/abhed-${SITE.tenant}.json`;

// ───────── the link to Abhed: env keys, or keys received by pairing (kept on disk while the instance lives) ─────────
let KEYS = JSON.parse(process.env.ABHED_KEYS ?? '{}');
let ADMIN_KEY = process.env.ABHED_ADMIN_KEY ?? '';
let link = { since: Object.keys(KEYS).length ? Date.now() : null, via: Object.keys(KEYS).length ? 'setup' : null, error: null };
if (!Object.keys(KEYS).length) {
  try {
    const saved = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    KEYS = saved.keys ?? {};
    ADMIN_KEY = saved.adminKey ?? '';
    link = { since: saved.since ?? Date.now(), via: 'pairing', error: null };
  } catch {
    /* not paired yet */
  }
}

// ───────── admin session: PIN → signed cookie (12 h) ─────────
const COOKIE_SECRET = process.env.SITE_COOKIE_SECRET ?? randomUUID();
const sign = (v) => createHmac('sha256', COOKIE_SECRET).update(v).digest('base64url');
const adminCookie = () => {
  const exp = String(Date.now() + 12 * 3_600_000);
  return `kv_site_admin=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.RENDER ? '; Secure' : ''}`;
};
function isAdmin(req) {
  const c = /(?:^|;\s*)kv_site_admin=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  if (!c) return false;
  const [exp, sig] = c.split('.');
  const want = Buffer.from(sign(exp ?? ''));
  const got = Buffer.from(sig ?? '');
  return got.length === want.length && timingSafeEqual(got, want) && Number(exp) > Date.now();
}
async function abhedAdmin(path, body) {
  const res = await fetch(`${ABHED_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${ADMIN_KEY}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({ error: 'Abhed unreachable' })) };
}
const pinTries = { n: 0, until: 0 };

let clients = {};
const profiles = new Map();
function useKeys(keys, adminKey) {
  KEYS = keys ?? {};
  ADMIN_KEY = adminKey ?? '';
  clients = Object.fromEntries(SITE.agents.filter((a) => KEYS[a.id]).map((a) => [a.id, new Abhed({ url: ABHED_URL, key: KEYS[a.id], site: SITE.brand })]));
  profiles.clear();
}
useKeys(KEYS, ADMIN_KEY);
const connected = () => Object.keys(clients).length > 0;

async function pairWith(code) {
  const r = await fetch(`${ABHED_URL}/api/connect/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // the website introduces itself: Abhed knew nothing about this company until now
    body: JSON.stringify({ code, site: { url: PUBLIC_URL, name: SITE.brand, sector: SITE.tenant, agents: SITE.agents.map((a) => ({ id: a.id, name: a.name })) } }),
  }).catch(() => null);
  if (!r) return { status: 502, data: { error: 'Abhed is unreachable from this website' } };
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { status: r.status, data: d };
  useKeys(d.keys, d.adminKey);
  link = { since: Date.now(), via: 'pairing', error: null };
  try {
    writeFileSync(STATE_FILE, JSON.stringify({ keys: d.keys, adminKey: d.adminKey, since: link.since }));
  } catch {
    /* read-only disk: stays in memory */
  }
  void beat();
  return { status: 200, data: { ok: true, company: d.company, agents: SITE.agents.filter((a) => clients[a.id]).map((a) => a.name), record: d.record } };
}
function dropLink(reason) {
  useKeys({}, '');
  link = { since: null, via: null, error: reason };
  try {
    unlinkSync(STATE_FILE);
  } catch {
    /* nothing saved */
  }
}

// every agent reports in; if Abhed has cut this company off, the website notices within seconds
async function beat() {
  const host = PUBLIC_URL.replace(/^https?:\/\//, '');
  for (const a of SITE.agents) {
    const key = KEYS[a.id];
    if (!key) continue;
    const r = await fetch(`${ABHED_URL}/api/connect/heartbeat`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ site: host }) }).catch(() => null);
    if (r?.status === 403) {
      dropLink('Abhed disconnected this website. Ask the Abhed operator for a new pairing code.');
      return;
    }
  }
}
setInterval(() => void beat(), 10_000);
void beat();
async function profileOf(id) {
  if (!profiles.has(id) || Date.now() - profiles.get(id).at > 60_000) profiles.set(id, { at: Date.now(), p: await clients[id].profile() });
  return profiles.get(id).p;
}

const tasks = new Map(); // id → { events, status, agent }
function newTask(agent) {
  const id = randomUUID().slice(0, 8);
  const t = { id, agent, status: 'working', events: [], createdAt: Date.now() };
  tasks.set(id, t);
  if (tasks.size > 200) tasks.delete(tasks.keys().next().value);
  return t;
}

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readBody = (req) =>
  new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c.length + d.length > 2_000_000 ? '' : c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(d || '{}'));
      } catch {
        resolve({});
      }
    });
  });

async function data() {
  const any = Object.values(clients)[0];
  if (!any) return { error: 'No agent keys configured' };
  const out = {};
  await Promise.all(SITE.tables.map(async (t) => (out[t] = await any.records(t).catch(() => []))));
  const statuses = {};
  await Promise.all(Object.keys(clients).map(async (id) => (statuses[id] = (await profileOf(id).catch(() => null))?.agent ?? null)));
  return { ...out, agents: statuses };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, page(SITE, ABHED_URL), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/admin') return send(res, 200, adminPage(SITE, ABHED_URL), 'text/html; charset=utf-8');
    if (req.method === 'POST' && url.pathname === '/admin/api/login') {
      if (pinTries.n >= 5 && Date.now() < pinTries.until) return send(res, 429, { error: 'Too many attempts, wait a minute' });
      const b = await readBody(req);
      if (String(b.pin ?? '') !== ADMIN_PIN) {
        pinTries.n += 1;
        pinTries.until = Date.now() + 60_000;
        return send(res, 401, { error: 'Wrong PIN' });
      }
      pinTries.n = 0;
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': adminCookie() });
      return res.end('{"ok":true}');
    }
    if (url.pathname.startsWith('/admin/api/')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'Admin sign-in required' });
      const sub = url.pathname.slice('/admin/api/'.length);
      if (sub === 'connect' && req.method === 'POST') {
        const b = await readBody(req);
        const r = await pairWith(String(b.code ?? '').trim().toUpperCase());
        return send(res, r.status, r.data);
      }
      if (!connected() || !ADMIN_KEY) return send(res, 409, { error: 'Not connected to Abhed yet', notConnected: true, abhed: ABHED_URL });
      if (sub === 'overview') {
        const r = await abhedAdmin('/api/v1/admin');
        return send(res, r.status, r.data);
      }
      if (sub === 'report') {
        const r = await abhedAdmin(`/api/v1/admin?report=${encodeURIComponent(url.searchParams.get('batch') ?? '')}`);
        return send(res, r.status, r.data);
      }
      if (sub === 'op' && req.method === 'POST') {
        const r = await abhedAdmin('/api/v1/admin', await readBody(req));
        return send(res, r.status, r.data);
      }
      if (sub === 'sample') {
        const r = await fetch(`${ABHED_URL}/api/lab/sample?tenant=${SITE.tenant}&kind=${encodeURIComponent(url.searchParams.get('kind') ?? 'tasks')}`);
        res.writeHead(r.status, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${SITE.tenant}-${url.searchParams.get('kind') ?? 'tasks'}-sample.csv"` });
        return res.end(await r.text());
      }
      return send(res, 404, { error: 'not found' });
    }
    if (url.pathname === '/health') return send(res, 200, { ok: true, site: SITE.brand, agents: Object.keys(clients) });
    if (url.pathname === '/api/connection') return send(res, 200, { connected: connected(), since: link.since, via: link.via, error: link.error, abhed: ABHED_URL, agents: SITE.agents.map((a) => ({ id: a.id, name: a.name, online: !!clients[a.id] })) });
    if (url.pathname === '/api/data') return send(res, 200, await data());
    if (url.pathname === '/api/protection') {
      // why these agents need Abhed: what they tried that was stopped or sent to a person, from Abhed's ledger
      if (!ADMIN_KEY || !connected()) return send(res, 200, { available: false, connected: false });
      const r = await abhedAdmin('/api/v1/admin');
      if (r.status !== 200) return send(res, 200, { available: false });
      const o = r.data;
      const mine = new Set(SITE.agents.map((a) => a.name));
      const caught = (o.ledger ?? []).filter((x) => mine.has(x.actor) && (x.decision === 'BLOCKED' || x.decision === 'NEEDS_APPROVAL')).slice(0, 5);
      const agents = (o.agents ?? []).filter((a) => SITE.agents.some((s) => s.id === a.id));
      const sum = (k) => agents.reduce((n, a) => n + (a.metrics?.[k] ?? 0), 0);
      return send(res, 200, {
        available: true,
        stopped: sum('blocked'),
        asked: sum('held'),
        actions: sum('actions'),
        paused: agents.filter((a) => a.status === 'PAUSED').length,
        chain: o.chain,
        caught: caught.map((x) => ({ seq: x.seq, ts: x.ts, actor: x.actor, action: x.action, decision: x.decision, reason: x.reason, rule: x.ruleRef })),
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/task') {
      const b = await readBody(req);
      const agent = SITE.agents.find((a) => a.id === b.agent) ?? SITE.agents[0];
      if (!clients[agent.id]) return send(res, 503, { error: `${agent.name} is offline: this website is not connected to Abhed yet.`, notConnected: true });
      const text = String(b.text ?? '').trim().slice(0, 1200);
      if (text.length < 3) return send(res, 400, { error: 'Type a message' });
      const t = newTask(agent.id);
      const abhed = clients[agent.id];
      const emit = (e) => t.events.push({ at: Date.now(), ...e });
      (async () => {
        try {
          const profile = await profileOf(agent.id);
          const context = SITE.context(b.customer ?? null, agent.id);
          await runAgent({ abhed, profile, task: text, from: b.customerName || SITE.brand, subject: b.customer?.id, context, history: Array.isArray(b.history) ? b.history : [], emit });
        } catch (e) {
          emit({ type: 'error', text: e.message });
        } finally {
          t.status = 'done';
        }
      })();
      return send(res, 200, { id: t.id });
    }
    const m = /^\/api\/task\/([\w-]+)$/.exec(url.pathname);
    if (m) {
      const t = tasks.get(m[1]);
      return t ? send(res, 200, t) : send(res, 404, { error: 'not found' });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});
server.listen(PORT, () => console.log(`${SITE.brand} on :${PORT} → governed by ${ABHED_URL} (${Object.keys(clients).join(', ') || 'no keys'})`));
}
