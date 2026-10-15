'use client';

import { useState } from 'react';
import { PricingHero } from './hero';

const PROBLEMS = [
  ['Agents act with human permissions, without human accountability', 'An agent can refund, prescribe, re-price or email customers. When it goes wrong, nobody can say who allowed it.'],
  ['All-or-nothing control', 'Either every action needs a person (agents become useless) or none do (one bad action costs lakhs). Teams need checkpoints only where impact is high.'],
  ['Hallucinated actions', 'A model refunds ₹48,000 when the debit was ₹40,000, or refills a drug that was never prescribed. Text guardrails don’t catch wrong numbers.'],
  ['Prompt injection and data leaks', 'A hidden line in a customer message can make an agent export records. The model can’t be trusted to resist.'],
  ['Shadow and runaway agents', 'Unregistered scripts call production APIs; a looping agent repeats the same action 200 times.'],
  ['Audit trails anyone can edit', 'Logs in a database the company controls prove nothing to a regulator or a court.'],
  ['No view of cost, risk and value', 'Finance can’t see what each agent costs in tokens, what it saved, or how risky it is.'],
  ['Every company has different rules', 'A bank, a hospital and a marketplace need different policies, and those policies change every quarter.'],
  ['Regulation is arriving', 'EU AI Act Art. 14 (human oversight), India’s DPDP Act 2023 and RBI’s FREE-AI framework (2025) all expect provable oversight of automated decisions.'],
];

const COMPETITORS: [string, string, string, string, string, string, string][] = [
  // name, focus, runtime action gate, human approval on phone, grounding/hallucination, tamper-proof trail, vendor-neutral
  ['Abhed', 'Runtime governance for agent actions', '✓ every tool call', '✓ hash-bound, two-key, escalation', '✓ vs system of record', '✓ signed Merkle + Bitcoin anchor', '✓ any model / framework'],
  ['IBM watsonx.governance', 'Model lifecycle, risk & compliance', 'partial', '—', 'model evaluation', 'factsheets', 'mostly IBM stack'],
  ['AWS Bedrock AgentCore', 'Agent runtime, identity, policy on AWS', '✓ policy on tool calls', '—', '—', 'CloudTrail', 'AWS'],
  ['Microsoft Entra Agent ID / Agent 365', 'Identity and management of agents', 'identity & access', '—', '—', 'Purview audit', 'Microsoft 365'],
  ['ServiceNow AI Control Tower', 'Enterprise AI inventory & workflows', 'partial', 'workflow approvals', '—', 'platform logs', 'ServiceNow'],
  ['Guardrail libraries (NeMo Guardrails, Guardrails AI, Lakera)', 'Filter LLM inputs/outputs', 'text only', '—', 'format checks', '—', '✓'],
  ['Credo AI / Holistic AI', 'AI policy & compliance documentation', '—', '—', '—', 'assessments', '✓'],
];

// Pure usage pricing, benchmarked Oct 2026: AWS AgentCore Policy ≈ $0.025 per 1,000 checks (a single policy check),
// Microsoft Agent 365 $15/user/month, IBM watsonx.governance ≈ $3.5k–6.5k/month (third-party estimates).
// No plans, no minimum: a company pays for the actions it governs and the agents that ran that month.
const FREE_ACTIONS = 10000; // every month
const FREE_AGENTS = 2; // every month, the two cheapest
const SLABS: [number, number][] = [
  [1_000_000, 0.04], // ₹40 per 1,000 up to 10 lakh actions
  [10_000_000, 0.02], // ₹20 per 1,000 from 10 lakh to 1 crore
  [Infinity, 0.01], // ₹10 per 1,000 above 1 crore
];
const AGENT = { low: 500, medium: 750, high: 1000 }; // ₹ per active agent per month, by risk
// checkpoints and phone approvals are never metered: a company should never pay more for being careful

function actionFee(n: number) {
  let fee = 0;
  let from = FREE_ACTIONS;
  for (const [upTo, rate] of SLABS) {
    if (n <= from) break;
    fee += (Math.min(n, upTo) - from) * rate;
    from = upTo;
  }
  return fee;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export default function BusinessPage() {
  const [agents, setAgents] = useState({ low: 5, medium: 7, high: 8 });
  const [actions, setActions] = useState(800000);
  const [llm, setLlm] = useState(0);

  const totalAgents = agents.low + agents.medium + agents.high;
  // the free agents are the cheapest ones
  let free = FREE_AGENTS;
  let agentFee = 0;
  for (const k of ['low', 'medium', 'high'] as const) {
    const waived = Math.min(free, agents[k]);
    free -= waived;
    agentFee += (agents[k] - waived) * AGENT[k];
  }
  const actFee = actionFee(actions);
  const llmFee = llm * 1.1;
  const bill = agentFee + actFee + llmFee;

  return (
    <>
    <PricingHero
      actions={actions}
      setActions={setActions}
      high={agents.high}
      setHigh={(n) => setAgents({ ...agents, high: n })}
      bill={bill}
      agentFee={agentFee}
      onReset={() => {
        setAgents({ low: 5, medium: 7, high: 8 });
        setActions(800000);
        setLlm(0);
      }}
    />
    <main className="page">
      <h2 className="sr-only">The problem, the price, the field</h2>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-title">
          <span>
            <b>Major problems</b> companies hit when agents start doing real work
          </span>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {PROBLEMS.map(([t, d], i) => (
            <div key={t} style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
              <div className="mono dim" style={{ fontSize: 11 }}>
                0{i + 1}
              </div>
              <div style={{ fontWeight: 500, margin: '2px 0 4px' }}>{t}</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {d}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', marginBottom: 14, alignItems: 'start' }}>
        <div className="panel">
          <div className="panel-title">
            <span>
              <b>Usage formula</b> · monthly bill
            </span>
          </div>
          <div className="price-eq">
            Bill = governed actions (by slab)
            <br />
            &nbsp;&nbsp;+ Σ<sub>active agents</sub> rate by risk
            <br />
            &nbsp;&nbsp;+ ₹0 for checkpoints and phone approvals, always
            <br />
            &nbsp;&nbsp;+ LLM tokens at cost + 10% (optional; or bring your own key)
            <br />
            &nbsp;&nbsp;− free every month: 10,000 actions + 2 agents
          </div>
          <table className="table" style={{ marginTop: 10, fontSize: 12.5 }}>
            <tbody>
              <tr>
                <td className="mono">actions</td>
                <td>₹40 per 1,000 up to 10 lakh a month · ₹20 per 1,000 up to 1 crore · ₹10 per 1,000 above. The more you govern, the less each action costs.</td>
              </tr>
              <tr>
                <td className="mono">agents</td>
                <td>Per agent that ran that month: ₹500 read-only · ₹750 writes inside limits · ₹1,000 money, health data or prices</td>
              </tr>
              <tr>
                <td className="mono">₹0</td>
                <td>Checkpoints, phone approvals, escalations, audit PDFs and the signed ledger are never metered</td>
              </tr>
              <tr>
                <td className="mono">GST</td>
                <td>No plans, no minimum, no lock-in. Billed monthly on actual use. Prices exclude 18% GST</td>
              </tr>
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            Why pure usage: a company starts free and pays only as its agents do real work, so the bill grows with the value. Usage grows with agents and volume, never with safety: a company should never pay more because a person checked something. For scale, AWS AgentCore Policy lists about $0.025 per 1,000 checks (one policy check), Microsoft Agent 365 $15 per user a month, and third-party estimates put IBM watsonx.governance at $3,500–6,500 a month.
          </p>
        </div>

        <div className="panel" id="calc" style={{ scrollMarginTop: 'calc(var(--topbar-h, 72px) + 24px)' }}>
          <div className="panel-title">
            <span>
              <b>Calculator</b>
            </span>
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            {(['low', 'medium', 'high'] as const).map((k) => (
              <label key={k} className="field">
                {k} risk agents
                <input inputMode="numeric" value={agents[k]} onChange={(e) => setAgents({ ...agents, [k]: Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0) })} />
              </label>
            ))}
            <label className="field" style={{ gridColumn: 'span 3' }}>
              Governed actions / month
              <input inputMode="numeric" value={actions} onChange={(e) => setActions(Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))} />
            </label>
            <label className="field" style={{ gridColumn: 'span 3' }}>
              LLM tokens through the gateway (₹ at cost)
              <input inputMode="numeric" value={llm} onChange={(e) => setLlm(Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))} />
            </label>
          </div>
          <table className="table" style={{ marginTop: 12 }}>
            <tbody>
              <Row k={`Governed actions: ${actions.toLocaleString('en-IN')} (first 10,000 free)`} v={actFee} />
              <Row k={`Active agents: ${totalAgents} (first 2 free, priced by risk)`} v={agentFee} />
              <Row k="Checkpoints and phone approvals (unlimited)" v={0} />
              <Row k="LLM gateway (cost + 10%)" v={llmFee} />
              <tr>
                <td>
                  <b>Monthly bill</b>
                </td>
                <td className="r">
                  <b style={{ fontSize: 20 }}>{inr(bill)}</b>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {totalAgents} agents · {inr(bill / Math.max(1, totalAgents))} per agent · ₹{(bill / Math.max(1, actions)).toFixed(3)} per governed action · plus 18% GST. One stopped ₹40,000 wrong refund covers {bill > 0 ? `${Math.round((40000 / bill) * 100)}%` : 'all'} of this bill.
          </div>
        </div>
      </div>

      <div className="panel" style={{ overflowX: 'auto' }}>
        <div className="panel-title">
          <span>
            <b>How Abhed compares</b> · positioning from public product descriptions
          </span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Main focus</th>
              <th>Gate on each agent action</th>
              <th>Human approval on phone</th>
              <th>Hallucination / grounding</th>
              <th>Tamper-proof trail</th>
              <th>Vendor-neutral</th>
            </tr>
          </thead>
          <tbody>
            {COMPETITORS.map((c, i) => (
              <tr key={c[0]} style={i === 0 ? { background: 'rgba(111, 224, 180, 0.05)' } : undefined}>
                {c.map((x, j) => (
                  <td key={j} style={{ fontWeight: j === 0 ? 500 : 400, color: j > 1 && x.startsWith('✓') ? 'var(--allow)' : j > 1 && x === '—' ? 'var(--muted-2)' : undefined, fontSize: 12.5 }}>
                    {x}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          The large platforms govern models, identities or their own cloud. Guardrail libraries filter text. Abhed governs the business action itself, for any model and any framework: the refund, the prescription, the price. It names the person who allowed it, and the proof sits outside the company’s own database. That is the gap.
        </p>
      </div>
    </main>
    </>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <tr>
      <td className="muted" style={{ fontSize: 12.5 }}>
        {k}
      </td>
      <td className="r">{inr(v)}</td>
    </tr>
  );
}
