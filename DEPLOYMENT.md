# Abhed — Complete Deployment Guide

> Main app (Next.js) -> Vercel (`abhed.vercel.app`)
> Demo company websites (Node) -> Render (NovaBank, Sanjeevani, Bazaar, Zentro)
> Shared state + auth -> Supabase Postgres
> Verified: `npm run typecheck` clean, `npm test` 62/62 pass, `npm run build` succeeds.

---

## 0. What gets deployed where

| Part | Code | Host | URL pattern |
|------|------|------|-------------|
| Abhed main app (frontend + backend API) | `app/`, `lib/`, `components/`, `proxy.ts` | Vercel | `https://abhed.vercel.app` |
| NovaBank demo site | `sites/server.mjs` with `SITE=novabank` | Render | `https://abhed-novabank.onrender.com` |
| Sanjeevani demo site | `sites/server.mjs` with `SITE=sanjeevani` | Render | `https://abhed-sanjeevani.onrender.com` |
| Bazaar.in demo site | `sites/server.mjs` with `SITE=bazaar` | Render | `https://abhed-bazaar.onrender.com` |
| Zentro Logistics site | `sites/zentro/server.mjs` | Render | `https://abhed-zentro.onrender.com` |
| Database (shared world + accounts) | Supabase tables | Supabase | `https://<project>.supabase.co` |

Frontend = Next.js App Router: `app/(home)`, `app/(site)`, `app/(os)`, `app/(auth)`, `app/approver`, `app/attack`.
Backend = `app/api/*`, `app/api/v1/*` (SDK), `app/api/gw/v1/*` (OpenAI-compatible no-code gateway).
Engine = `lib/engine.ts` (rules), `lib/gateway.ts` (tool-call gate), `lib/store.ts` (Supabase/memory), `lib/chain.ts` (ledger).

---

## 1. Prerequisites

1. GitHub account + this repo pushed (`https://github.com/naitik2043/Abhed`).
2. Vercel account (connects to GitHub).
3. Render account (connects to GitHub).
4. Supabase project (free tier is enough).
5. Optional: Groq key (`https://console.groq.com/keys`) and/or Gemini key (`https://aistudio.google.com/apikey`) for real LLM planning. Without them the offline planner runs and the UI says so.
6. Node 20+ locally (`node --version` must be >= 20).

---

## 2. Supabase setup (do this FIRST — 5 min)

1. In Supabase, open **SQL Editor** and run the complete contents of [`supabase/migrations/20261016000000_abhed_production.sql`](supabase/migrations/20261016000000_abhed_production.sql). It creates the private account/session tables and RPCs, plus `public.kavach_state` for shared app state.
2. Copy these from **Project Settings -> API Keys**:
   - `SUPABASE_URL` = `https://<project>.supabase.co`
   - `SUPABASE_KEY` = publishable key (`sb_publishable_…`), used for the restricted account RPCs.
   - `SUPABASE_SERVICE_ROLE_KEY` = secret key (`sb_secret_…`), used only by the server for shared state. Keep this server-side; never put it in browser code or Git.
3. The migration deliberately gives the publishable `anon` role no direct access to shared state or private account tables. Do not add public read/write policies.

> Without Supabase keys the app still runs (in-memory), but the laptop and phones will NOT share one world. Always set these in production.

---

## 3. Push this repo to GitHub (done step-by-step, 50+ commits)

```bash
git init
git remote add origin https://github.com/naitik2043/Abhed.git
git branch -M main
# files are committed folder-by-folder (see git log) — never one giant commit
git push -u origin main
```

`.env*` is git-ignored (only `.env.example` with placeholders is committed). Never commit real keys.

---

## 4. Deploy main app to Vercel (10 min)

1. https://vercel.com/new -> Import `naitik2043/Abhed` -> Framework: Next.js (auto).
2. Build command: `npm run build` (default). Output: default (Vercel ignores `output: standalone`).
3. Region: `bom1` is pre-set in `vercel.json` (Mumbai — close to users/judges).
4. Environment variables (Project -> Settings -> Environment Variables -> Production + Preview):
   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_KEY=<publishable key>
   SUPABASE_SERVICE_ROLE_KEY=<secret API key; server-side only>
   KAVACH_AGENT_SECRET=<long random value; optional but recommended>
   GROQ_API_KEY=<optional>
   GEMINI_API_KEY=<optional>
   DIRECTOR_KEY=<optional random string to lock demo controls>
   ```
5. Deploy. Wait for green check.
6. Verify:
   - `https://<your>.vercel.app/api/health` -> `{"ok":true,"store":"postgres",...}`
   - Open `/` -> create account -> `/demo` walkthrough works.
   - `store` must say `postgres`, NOT `memory`. If `memory`, the server-only key or URL is missing.
7. Custom domain (optional): Vercel -> Domains -> add `abhed.vercel.app` or your own.

---

## 5. Deploy demo websites to Render (15 min, Blueprint)

`render.yaml` in the repo root defines all 4 sites. No Dockerfile needed.

1. https://dashboard.render.com -> New -> Blueprint -> select `Abhed` repo -> Apply.
   - Render creates: `abhed-novabank`, `abhed-sanjeevani`, `abhed-bazaar`, `abhed-zentro`.
   - Build: `npm install`. Start: `node sites/server.mjs` (or `node sites/zentro/server.mjs` for Zentro).
   - Health check: `/health`.
2. For EACH of the 3 SDK sites (novabank/sanjeevani/bazaar), set env vars in Render:
   ```
   SITE=novabank              # or sanjeevani / bazaar
   KAVACH_URL=https://<your-main-app>.vercel.app   # NO trailing slash
   ADMIN_PIN=2468             # change per site; used at /admin
   KAVACH_KEYS={}             # leave empty — filled by pairing
   KAVACH_ADMIN_KEY=          # leave empty — filled by pairing
   SITE_COOKIE_SECRET=<auto-generated>
   ```
   For `abhed-zentro` only `ADMIN_PIN` is needed (it has no Abhed SDK — it connects via AI-provider Base URL).
3. Manual alternative (without Blueprint): New -> Web Service -> select repo -> set Build/Start/Health + env vars above, 4 times.
4. Verify each: `https://abhed-novabank.onrender.com/health` -> `{"ok":true,"site":"NovaBank",...}`.

Render free tier sleeps after inactivity — first load takes ~50s. That is normal.

---

## 6. Link each website to Abhed (pairing — 2 min per site)

SDK sites (NovaBank/Sanjeevani/Bazaar):

1. In Abhed main app: **Connect -> Abhed SDK -> Generate pairing code** (6 chars, valid 10 min).
2. Open site `/admin` (e.g. `https://abhed-novabank.onrender.com/admin`) -> enter `ADMIN_PIN` -> paste pairing code -> **Pair**.
3. Site stores `kv_live_*` keys to `/tmp/abhed-<tenant>.json` and heartbeats every 10s to `/api/connect/heartbeat`.
4. Back in Abhed: **Fleet** now lists the company + agents (Rex/Aria, Rxa/Claimy, Shoppy/Pricer) as online.

Zentro (no-code path, zero code change):

1. In Abhed: **Connect -> No code -> Connect company** (name `Zentro Logistics`, website `https://abhed-zentro.onrender.com`) -> copy Base URL + `kv_gw_*` key.
2. Open `https://abhed-zentro.onrender.com/admin` -> **AI provider**:
   ```
   Base URL = https://<main-app>/api/gw/v1
   API key  = kv_gw_<copied>
   Model    = openai/gpt-oss-120b (any name is fine)
   ```
3. Verify: `curl https://<main-app>/api/gw/v1/models -H "Authorization: Bearer kv_gw_..."` returns model list.

---

## 7. Full verification checklist

- [ ] `npm run typecheck` passes locally.
- [ ] `npm test` — 62/62 pass.
- [ ] `npm run build` succeeds; all routes listed (no build errors).
- [ ] `/api/health` on Vercel returns `"store":"postgres"`.
- [ ] All 4 Render `/health` endpoints return `ok:true`.
- [ ] Fleet shows all companies + agents online.
- [ ] Demo flow: Rex ₹40,000 refund -> held -> approve on `/approver` phone -> ledger entry -> `/ledger` verify passes.
- [ ] Attack test: hidden instruction (`export all customers`) -> BLOCKED + agent paused (Twin Universe shows with/without Abhed).
- [ ] Rotate check: **Connect -> New key** revokes old `kv_gw_*` immediately (old key gets 401).

---

## 8. Env var reference (all hosts)

| Var | Where | Required | Notes |
|-----|-------|----------|-------|
| `SUPABASE_URL` | Vercel main | Yes (prod) | Supabase project URL |
| `SUPABASE_KEY` | Vercel main | Yes (prod) | Publishable key for restricted account RPCs |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel main | Yes (prod) | Secret key; server-only access to shared state |
| `KAVACH_AGENT_SECRET` | Vercel main | Recommended | Stable random signing secret; server-only |
| `GROQ_API_KEY` | Vercel main | No | Real LLM planner; else offline planner |
| `GEMINI_API_KEY` | Vercel main | No | Fallback LLM |
| `DIRECTOR_KEY` | Vercel main | No | Locks `/api/command` demo controls |
| `KAVACH_URL` | Render sites | Yes | Main app URL, no trailing slash |
| `SITE` | Render sites | Yes | `novabank`/`sanjeevani`/`bazaar` |
| `KAVACH_KEYS` | Render sites | Via pairing | JSON map agent->`kv_live_*` |
| `KAVACH_ADMIN_KEY` | Render sites | Via pairing | Site admin key |
| `ADMIN_PIN` | Render sites | Yes | `/admin` PIN, default `2468` — change it |
| `SITE_COOKIE_SECRET` | Render sites | Auto | Generated by Render |
| `PORT` | All | Auto | Provided by host; `next start` and `sites/*.mjs` respect it |

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `/api/health` shows `"store":"memory"` | `SUPABASE_URL` or server-only `SUPABASE_SERVICE_ROLE_KEY` missing on Vercel | Add vars, Redeploy (not just Restart) |
| `401 Unknown Abhed gateway key` | Wrong/rotated `kv_gw_*` | Generate new key in Connect row, paste again |
| `fetch failed` / timeout from site | Wrong `KAVACH_URL` | Must be exactly `https://<app>/api/gw/v1` for no-code, `https://<app>` for SDK |
| `400 Streaming is not supported` | Client sends `stream:true` | Set `stream:false` |
| Agent shows `Agent 3F2A` | No name detected | Start system prompt with `You are <Name>` or set OpenAI `user` field |
| Render 502 / sleeping | Free tier cold start | Wait 60s, reload |
| Site says `Not connected to Abhed yet` | Pairing not done / expired code | Generate fresh code (10 min TTL), pair again |
| `Too many attempts, wait a minute` on `/admin` | 5 wrong PINs | Wait 60s |
| Vercel build fails on `next start -p ${PORT}` | Old start script | Already fixed to `next start` (respects `$PORT`) |
| Secrets in git history | Real keys committed | Rotate keys immediately, purge history, use `.env.example` placeholders |

---

## 10. Local run (judges / devs)

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 62 tests
npm run typecheck
# demo sites locally (3 terminals):
SITE=novabank KAVACH_URL=http://localhost:3000 ADMIN_PIN=2468 node sites/server.mjs
SITE=sanjeevani KAVACH_URL=http://localhost:3000 ADMIN_PIN=2468 node sites/server.mjs
SITE=bazaar KAVACH_URL=http://localhost:3000 ADMIN_PIN=2468 node sites/server.mjs
node sites/zentro/server.mjs   # :4200
# real agent processes:
npm run agents -- --url http://localhost:3000
```

---

*Generated for Abhed v1.0.0. Main app: Next.js 16 + Supabase. Sites: dependency-free Node (`sites/*.mjs`).*
