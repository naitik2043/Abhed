import { ConnectGuide } from './guide';

const SNIPPET = `import { Abhed } from './abhed-sdk.mjs';          // 69 lines, zero dependencies

const abhed = new Abhed({ url: 'https://abhed.vercel.app', key: process.env.KAVACH_AGENT_KEY });
const me = await abhed.profile();                     // role, tool schemas, delegations
const session = await abhed.session(task, { from });  // scanned for prompt injection first

while (true) {
  const r = await abhed.think(session, messages, me.tools);   // LLM via the Abhed gateway
  const call = r.message.tool_calls?.[0];
  if (!call) break;                                            // the agent's answer
  let d = await abhed.call(session, call.function.name, JSON.parse(call.function.arguments));
  if (d.decision === 'NEEDS_APPROVAL') d = await abhed.waitForApproval(d.approvalId); // a person, on their phone
  messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(d) });
}`;

const CURL = `curl -X POST https://abhed.vercel.app/api/v1/tools/call \\
  -H "Authorization: Bearer kv_live_…" -H "content-type: application/json" \\
  -d '{"sessionId":"S-12","tool":"issue_refund","args":{"customer":"C-1029","amount":40000}}'

→ {"decision":"NEEDS_APPROVAL","approvalId":"APR-913","rule":"REFUND-L1@2",
   "reason":"₹40,000 is above the ₹10,000 per-action limit Priya Menon delegated to Rex…",
   "record":344,"gatewayMs":0.9}`;

const API = [
  ['GET', '/api/v1/agent', 'Who am I: role, delegations, OpenAI-format tool schemas to hand the LLM'],
  ['POST', '/api/v1/sessions', 'Open a governed task. Scanned by pattern rules + Llama Prompt Guard 2 before any model sees it'],
  ['POST', '/api/v1/llm', 'Think through the Abhed LLM gateway: metered tokens and ₹ cost per agent, logged to the ledger'],
  ['POST', '/api/v1/tools/call', 'Every tool call: identity → delegation → grounding → DLP → rules → checkpoint → execute → hash-chained record'],
  ['GET', '/api/v1/approvals/:id', 'Wait while a person decides on their phone; the result comes back executed exactly as approved'],
  ['POST', '/api/v1/sessions/:id/finish', 'Close the task with the agent’s answer'],
];

const SITES = [
  ['NovaBank', 'Retail bank · Rex (refunds), Aria (cards)', 'https://novabank-agents.onrender.com', 'var(--ink)'],
  ['Sanjeevani Hospital', 'Hospital · Rxa (pharmacy), Claimy (insurance)', 'https://sanjeevani-agents.onrender.com', 'var(--muted)'],
  ['Bazaar.in', 'E-commerce · Shoppy (orders), Pricer (pricing)', 'https://bazaar-agents.onrender.com', 'var(--muted-2)'],
];

export default function IntegratePage() {
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Connect your website, <em>in minutes</em>
          </h1>
          <p className="page-sub">Keep your agents and your code. Point them at Abhed, and every action they take is checked before it runs.</p>
        </div>
      </div>

      <ConnectGuide />

      <div className="ig-ref">
        <p className="kicker">Reference</p>
        <h2>Already running on Abhed: three company websites, and the API they use.</h2>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 14 }}>
        {SITES.map(([name, what, url, tone]) => (
          <a key={name} href={url} target="_blank" rel="noopener" className="panel" style={{ borderTop: `2px solid ${tone}`, display: 'block' }}>
            <div style={{ fontSize: 17, fontWeight: 500 }}>{name} ↗</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              {what}
            </div>
            <div className="mono dim" style={{ fontSize: 11, marginTop: 8 }}>
              {url.replace('https://', '')} · separate deployment · own agents · 1 Abhed key each
            </div>
          </a>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="panel">
          <div className="panel-title">
            <span>
              <b>The whole integration</b> · what the three sites above actually run (sites/agent.mjs)
            </span>
          </div>
          <pre className="price-eq" style={{ whiteSpace: 'pre', fontSize: 12 }}>
            {SNIPPET}
          </pre>
          <div className="panel-title" style={{ marginTop: 16 }}>
            <span>
              <b>Or plain HTTP</b> · any language, any framework (LangChain, CrewAI, OpenAI Agents SDK, n8n…)
            </span>
          </div>
          <pre className="price-eq" style={{ whiteSpace: 'pre', fontSize: 12 }}>
            {CURL}
          </pre>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="panel">
            <div className="panel-title">
              <span>
                <b>Agent API v1</b>
              </span>
            </div>
            <table className="table">
              <tbody>
                {API.map(([m, p, d]) => (
                  <tr key={p}>
                    <td className="mono" style={{ color: m === 'GET' ? 'var(--info)' : 'var(--allow)' }}>
                      {m}
                    </td>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                      {p}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {d}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <div className="panel-title">
              <span>
                <b>Onboarding a company</b> · 5 steps
              </span>
            </div>
            <ol style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <li>Register each agent: owner, purpose, model, risk tier → Abhed issues a <span className="mono">kv_live_</span> key (the company never shares its LLM keys).</li>
              <li>Connect tools: read-only tools pass through; write tools get a risk level and a data class.</li>
              <li>Pick a sector pack (banking, healthcare, e-commerce) and add company rules in plain English on the Rulebook. Each rule is replayed on 30 days of history and needs a second person.</li>
              <li>Owners delegate: “Rex may refund up to ₹10,000 per action, ₹5,00,000 a day.” Anything above goes to a person.</li>
              <li>Approvers install the Abhed approver PWA on their phones. Done: the agent is governed and on the fleet dashboard.</li>
            </ol>
          </div>
          <div className="panel">
            <div className="panel-title">
              <span>
                <b>Why it does not slow agents down</b>
              </span>
            </div>
            <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }} className="muted">
              <li>The rule engine is deterministic code, not an LLM: a decision takes about a millisecond (measured per call, shown on every step).</li>
              <li>Only high-impact actions stop for a person; reads and in-limit actions run immediately.</li>
              <li>Approvals bind to a SHA-256 hash of the exact action, so a person approves once and the agent can’t change a rupee.</li>
              <li>Ledger sealing, Merkle blocks and Bitcoin anchoring happen after the response, off the hot path.</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
