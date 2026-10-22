# Abhed (अभेद): the accountability layer for AI agents

> **One gate for every action an AI agent takes. A person for the big ones. A ledger no one can edit.**

## About

AI agents now refund customers, change records and send data on their own. When one gets it wrong, a company has to be able to say **who allowed it, why, and prove it**. Abhed sits between an agent's decision and the real action, checks every action against rules before it runs, sends the risky ones to the right person on their phone, and writes every decision to a tamper-evident ledger.

*Abhed* (अभेद) is Hindi for "impenetrable".

**Live:** [abhed.vercel.app](https://abhed.vercel.app) · Built for **CodeX 3.0 · Hack Arena · PS5: AI Agent Governance and Human Accountability Operating System**. The companies in the demo (NovaBank, Bazaar.in, Zentro Logistics and the rest) are fictional.

**Documents:** [Connect guide (PDF)](docs/Abhed_Connect_Guide.pdf) · [How the gateway works, 2 pages (PDF)](docs/Abhed_Gateway_Explained.pdf) · [Solution brief](docs/Abhed_Solution_Brief.pdf) · [Pricing note](docs/Abhed_Pricing_Note.pdf) · [Round 1 deck](docs/Abhed_Round1_Deck.pdf) · [Deployment guide](docs/Abhed_Deployment_Guide.pdf) · [Demo script](DEMO_SCRIPT.md) · [Full deploy steps](DEPLOYMENT.md)

---

## Contents

1. [About](#about)
2. [What Abhed does](#what-abhed-does)
3. [How one decision works](#how-one-decision-works)
4. [Connect your own website](#connect-your-own-website-step-by-step)
5. [Try the live demo](#try-the-live-demo)
6. [Architecture](#architecture)
7. [Security](#security)
8. [Run it yourself](#run-it-yourself)
9. [Deploy it](#deploy-it)
10. [Honest limits](#honest-limits)

---

## What Abhed does

| | |
|---|---|
| **Checks the action, not the words** | Every tool call (refund, email, export, delete) is checked by a deterministic rulebook before it runs. Same input, same decision, and the rule that decided is on the record. |
| **A person for the big moves** | Small, reversible work runs on its own in about a millisecond. A refund above a limit, data leaving the company or a change of access waits for the right person, who approves on their phone with the evidence in front of them. The approval is bound to a SHA-256 of the exact action. |
| **Proof no one can edit** | Each decision is a record chained to the one before it and sealed in signed blocks. |
| **Governs the people too** | Approving in under 4 seconds without opening the evidence is flagged as rubber-stamping. Changing a rule needs a second person. |
| **A kill switch outside the model** | Pause revokes the agent's key at the gateway. Its open work moves to people. |
| **No-code connection** | A company connects its existing agents by changing two settings: a base URL and an API key. No code, no redeploy. |

## How one decision works

```
 Agent wants to act ──► Abhed gateway ──────────────────────────────► Company system
 (refund Rs.40,000)       │                                              (runs only what
                         ├─ 1. Who is this?        agent identity, owner, key
                         ├─ 2. Is it allowed?      the person's delegation (Rs.10,000)
                         ├─ 3. Rules               block wins · unknown high-impact → a person
                         ├─ 4. Checkpoint          held → approver's phone (hash-bound, expiring)
                         ├─ 5. Execute             exactly what was approved, once
                         └─ 6. Ledger              masked, hash-chained, signed
```

## Connect your own website, step by step

### Path A · No code (any OpenAI-compatible agent)

1. Open the app, **Get started**, create an account, **Connect → No code** → company name + website → **Connect company**. Copy Base URL + `kv_gw_*` key (shown once).
2. Point agents at Abhed:

```bash
OPENAI_BASE_URL=https://abhed.vercel.app/api/gw/v1
OPENAI_API_KEY=kv_gw_your_key_here
```

3. Check: `curl https://abhed.vercel.app/api/gw/v1/models -H "Authorization: Bearer kv_gw_..."`.
4. Send any agent message. Actions must be OpenAI **tool calls** to be checked.
5. Watch the gate: refused calls are stripped with reason; big calls wait for a person in Connect.

### Path B · SDK (banking, healthcare, ecommerce)

1. **Connect → Abhed SDK → Generate pairing code** (6 chars, 10 min).
2. Redeem from your server: `POST /api/connect/pair` with code + site descriptor → `kv_live_*` keys.
3. Copy `sites/abhed-sdk.mjs` into your project, send every action via `abhed.call(session, tool, params)`.
4. `NEEDS_APPROVAL` → `abhed.waitForApproval(id)` → EXECUTED / BLOCKED / REJECTED with rule + ledger record.

## Try the live demo

1. Open the app and create an account.
2. **Live demo**: agent asks Rs.40,000 → person approves on phone → poisoned message blocked → agent paused.
3. **Break Abhed**: write your own attack, watch the gate respond.
4. **Approver app** (`/approver`) on your phone for high-risk actions.
5. **Fleet** shows every company and agent live.

## Architecture

One Next.js app (TypeScript, App Router) on Vercel, Supabase Postgres for shared state. Demo company websites are small Node servers on Render.

```
 Company website / agents ──► /api/gw/v1 (no-code) ─┐
                          └──► /api/v1    (SDK)     ─┼─► rules · checkpoint · ledger ─► Supabase
 People: browser + phone  ──► Abhed app (Next.js)   ─┘
```

| Path | What lives there |
|---|---|
| `lib/engine.ts` | Gateway for SDK agents: rules, approvals, ledger, pause/restrict, incidents, replay |
| `lib/gateway.ts` | No-code AI gateway: agent identification, tool-call rulebook, holds |
| `lib/planner.ts` | Demo agents' brain: real LLM with `GROQ_API_KEY`, otherwise offline planner |
| `lib/store.ts` | Shared state with optimistic concurrency |
| `sites/` | Demo company websites + SDK (`abhed-sdk.mjs`), `zentro/` standalone site |
| `agents/run.mjs` | Real agent processes for live mode |
| `tests/` | 62 tests: approvals, twin universe, replay, tamper, two-key, escalation, gateway |

## Security

- Passwords bcrypt-hashed in DB; session tokens stored as SHA-256 only; lockout after 8 wrong attempts.
- Cookies `HttpOnly`, `SameSite=Lax`, `Secure` in production.
- Agent keys per-agent revocable; provider keys never reach browser.
- No secrets in repo — keys live in hosting env + Supabase Vault. See `.env.example`.

## Run it yourself

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 62 tests
npm run typecheck
```

Environment setup is in `.env.example`: Supabase URL + publishable key for account RPCs, a server-only Supabase secret key for shared state, and optional `ABHED_AGENT_SECRET`, LLM keys, and `DIRECTOR_KEY`.

## Deploy it

Full step-by-step: [DEPLOYMENT.md](DEPLOYMENT.md) · rules: [deployment.imp](deployment.imp) · printable: [docs/Abhed_Deployment_Guide.pdf](docs/Abhed_Deployment_Guide.pdf)

- Main app → Vercel (`vercel.json` region `bom1`), env: Supabase + LLM keys. Verify `/api/health` shows `store: postgres`.
- Demo sites → Render via `render.yaml` Blueprint (NovaBank, Sanjeevani, Bazaar, Zentro). Health `/health`.
- Link via pairing code (`/admin`) or no-code Base URL + key. Verify Fleet online + e2e refund + attack block.

## Honest limits

- Demo company tools are simulated adapters: refunds do not move real money.
- Rule engine is deterministic and explainable; Cedar/OPA could plug in at same point.
- No-code gateway does not support streaming yet (`stream: false`).
- SDK path uses banking/healthcare/ecommerce rulebooks; others use no-code path.
