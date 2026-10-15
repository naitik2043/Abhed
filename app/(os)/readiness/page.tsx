'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { inr, useWorld } from '@/components/app';
import StudioFooter from './studio-footer';

type Health = { ok: boolean; store: string; llm: boolean; tenants: { sector: string; company: string; ledger: number; agents: number }[] };

const READY: [string, string][] = [
  ['Three companies governed live', 'NovaBank, Sanjeevani Hospital and Bazaar.in run real agents on their own websites through one Abhed key each.'],
  ['Agent API v1 and SDK', 'Sessions, LLM calls, tool calls, approvals and records over REST. Any framework that can make an HTTP call.'],
  ['Real approver identities', 'PIN sign-in, signed 12-hour tokens, lockout after five wrong PINs, role checks on every decision.'],
  ['Tamper-evident ledger', 'SHA-256 chain, Merkle blocks signed with Ed25519, anchored to Bitcoin through OpenTimestamps.'],
  ['Secrets kept out of reach', 'LLM keys live in a vault and never reach a browser, a company site or the repository.'],
  ['Red-team and test lab', 'A company uploads its own requests, or swaps in a compromised agent, and reads the report.'],
  ['Audit on demand', 'One-click PDF for a company or a single agent, with compliance evidence mapped to regulations.'],
  ['Tested and deployed', '44 automated tests. Vercel for Abhed, Render for the company sites, a database in Mumbai.'],
];

const ROADMAP: { when: string; title: string; items: string[] }[] = [
  { when: 'Next 30 days', title: 'Reach', items: ['MCP adapter: govern any MCP tool server with no code change', 'Approvals on WhatsApp and Slack, not only the web app', 'Usage alerts and a monthly spend cap per company'] },
  { when: '90 days', title: 'Pilots', items: ['Paid pilots with one bank or NBFC and one hospital, on their own data', 'Private-cloud deployment inside the customer’s VPC', 'Hindi and regional-language approval cards'] },
  { when: '6 months', title: 'Enterprise', items: ['On-premise build for banks that must keep data in-house', 'SIEM export (Splunk, Sentinel) and SSO with SAML / OIDC', 'ISO 27001 path and an external penetration test'] },
  { when: '12 months', title: 'Platform', items: ['Agent-to-agent delegation with the same accountability chain', 'Policy-as-code import (OPA / Rego) for existing rulebooks', 'Insurance, fintech and government sector packs'] },
];

const LAYERS: { name: string; boxes: [string, string][] }[] = [
  { name: 'Clients', boxes: [['Company websites', 'customers talk to agents'], ['Agent frameworks', 'LangGraph · CrewAI · ADK · MCP'], ['Approver phones', 'installable web app'], ['Admins and auditors', 'fleet · rules · incidents']] },
  { name: 'Abhed API', boxes: [['/v1/sessions', 'one per customer'], ['/v1/tools/call', 'every action'], ['/v1/llm', 'every model call'], ['/v1/approvals · /v1/admin', 'people and policy']] },
  { name: 'Core · code, not a model', boxes: [['Action gateway', 'identity · scope · delegation · grounding · data loss · rules · checkpoint'], ['Approvals', 'roles · hold · escalate · two keys · fingerprint'], ['Incidents', 'chain · cause · replay · rule versions'], ['Monitor', 'Trust Score · circuit breaker · auto-pause']] },
  { name: 'Data and trust', boxes: [['Postgres per company', 'registry · rulebook · ledger'], ['Key vault', 'LLM keys never leave it'], ['Signed blocks', 'Merkle · Ed25519'], ['Public anchor', 'Bitcoin · OpenTimestamps']] },
];

export default function ReadinessPage() {
  const { view } = useWorld();
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => undefined);
  }, []);
  const k = view?.kpi;

  return (
    <>
    <main className="page ready">
      <div className="page-head">
        <div>
          <div className="kicker">Readiness and roadmap</div>
          <h1 className="page-title">
            Built to run today. <em>Planned for what comes next.</em>
          </h1>
          <p className="page-sub">What runs today, how a company adopts it, and what comes next.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link href="/demo" className="btn btn-solid">
            Start the live demo
          </Link>
          <Link href="/business" className="btn btn-ghost">
            Pricing
          </Link>
        </div>
      </div>

      <section className="r-sec">
        <div className="r-head">
          <h2>Live right now</h2>
          <p>Read from this deployment as the page loads, not typed in.</p>
        </div>
        <div className="r-stats">
          <Stat v={health ? String(health.tenants.length) : '…'} l="companies on this deployment" />
          <Stat v={health ? String(health.tenants.reduce((s, t) => s + t.agents, 0)) : '…'} l="governed agents" />
          <Stat v={health ? health.tenants.reduce((s, t) => s + t.ledger, 0).toLocaleString('en-IN') : '…'} l="signed ledger records" />
          <Stat v={k ? `${k.autoPct}%` : '…'} l="actions that needed nobody" />
          <Stat v={k ? inr(k.damagePrevented) : '…'} l="money held or stopped at the gate today" />
          <Stat v={health ? (health.llm ? 'online' : 'fallback') : '…'} l={health?.llm ? 'LLM gateway (gpt-oss-120b)' : 'LLM gateway: rule-based fallback'} />
        </div>
      </section>

      <section className="r-sec" id="architecture">
        <div className="r-head">
          <h2>Architecture</h2>
          <p>Ordinary, proven building blocks. The novelty is in the rules, not the plumbing.</p>
        </div>
        <div className="arch">
          {LAYERS.map((L, i) => (
            <div key={L.name} className="arch-row">
              <div className="arch-name">
                <span className="mono dim">0{i + 1}</span> {L.name}
              </div>
              <div className="arch-boxes">
                {L.boxes.map(([t, s]) => (
                  <div key={t} className={`arch-box ${i === 2 && t === 'Action gateway' ? 'key' : ''}`}>
                    <b>{t}</b>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="r-sec">
        <div className="r-head">
          <h2>Production-ready today</h2>
          <p>Each line below is a working part of this build that you can open and try.</p>
        </div>
        <div className="r-list">
          {READY.map(([t, s]) => (
            <div key={t} className="r-item">
              <span className="r-tick" aria-hidden="true">✓</span>
              <div>
                <b>{t}</b>
                <p>{s}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="r-sec" id="integrate">
        <div className="r-head">
          <h2>How a company adopts it</h2>
          <p>No rebuild. A company keeps its agents, its model and its framework.</p>
        </div>
        <div className="r-steps">
          <div className="r-step">
            <span className="mono dim">Day 1</span>
            <b>Register agents</b>
            <p>Each agent gets an Abhed key, a named owner, a purpose and limits a person delegates.</p>
          </div>
          <div className="r-step">
            <span className="mono dim">Day 2</span>
            <b>Route tool calls through Abhed</b>
            <p>Three lines with the SDK, or the REST API. The agent never holds the bank’s or hospital’s real keys again.</p>
          </div>
          <div className="r-step">
            <span className="mono dim">Day 3</span>
            <b>Load the rulebook and people</b>
            <p>Start from a sector pack, edit the rules in plain English, add approvers on the admin panel.</p>
          </div>
          <div className="r-step">
            <span className="mono dim">Week 1</span>
            <b>Test on your own data</b>
            <p>Upload real requests to the lab, run the red-team agent, read what would have leaked, then go live.</p>
          </div>
        </div>
        <pre className="r-code">{`const abhed = new Abhed({ url, key: 'kv_live_…' })
const s = await abhed.session({ subject: customer.id })
const r = await s.call('issue_refund', { amount: 40000 })   // ALLOWED · NEEDS_APPROVAL · BLOCKED`}</pre>
      </section>

      <section className="r-sec">
        <div className="r-head">
          <h2>Market readiness</h2>
          <p>Who buys first, why now, and how we reach them.</p>
        </div>
        <div className="r-cols">
          <div>
            <h3>Who buys first</h3>
            <p>Regulated Indian companies that already put agents in front of customers: banks and NBFCs, hospitals and insurers, e-commerce and fintech. The buyer is the CRO or CISO; daily users are operations managers and approvers.</p>
          </div>
          <div>
            <h3>Why now</h3>
            <p>RBI’s FREE-AI framework asks banks for AI inventories, audits and incident reporting. The DPDP Act makes a personal-data leak a board-level risk. OWASP published its first Top 10 for agentic applications in December 2025.</p>
          </div>
          <div>
            <h3>How we reach them</h3>
            <p>A free monthly allowance lets a prospect run its own data first. Sector packs shorten day one. Systems integrators that already deploy agents for banks can resell Abhed as the governance layer.</p>
          </div>
          <div>
            <h3>How we charge</h3>
            <p>Pure usage: ₹40 per 1,000 governed actions, falling to ₹10 at scale, plus ₹500–1,000 per active agent a month. Approvals and checkpoints are never charged. <Link href="/business" style={{ textDecoration: 'underline' }}>Calculator →</Link></p>
          </div>
        </div>
      </section>

      <section className="r-sec">
        <div className="r-head">
          <h2>Roadmap</h2>
          <p>What we build after the hackathon, in order.</p>
        </div>
        <div className="road">
          {ROADMAP.map((r) => (
            <div key={r.when} className="road-col">
              <span className="road-when">{r.when}</span>
              <b>{r.title}</b>
              <ul>
                {r.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="r-sec" style={{ borderBottom: 0 }}>
        <div className="r-head">
          <h2>Risks we plan for</h2>
          <p>Every risk has an answer already in the product or on the roadmap.</p>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '32%' }}>Risk</th>
              <th>Answer</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>The LLM provider rate-limits or fails</td><td>Two keys rotate automatically; a rule-based planner keeps agents working. Governance never depends on the LLM.</td></tr>
            <tr><td>A model is tricked by injected text</td><td>Scanned before the model sees it; the session is tainted; the gateway blocks data leaving the company whatever the model says.</td></tr>
            <tr><td>Approvers get tired or rubber-stamp</td><td>Only high-impact actions reach people, with evidence first; fast approvals without evidence are flagged.</td></tr>
            <tr><td>An insider edits the records</td><td>Hash chain, signed blocks and a Bitcoin timestamp catch the edit at the exact record.</td></tr>
            <tr><td>Nobody answers an approval</td><td>Automatic escalation L1 → L2 → executive, then expiry. Nothing is ever approved by default.</td></tr>
          </tbody>
        </table>
      </section>
    </main>
    <StudioFooter />
    </>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div className="r-stat">
      <div className="r-v">{v}</div>
      <div className="r-l">{l}</div>
    </div>
  );
}
