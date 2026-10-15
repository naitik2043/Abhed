'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Step = { t: string; body: React.ReactNode; code?: { label: string; text: string }[]; see: string };

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="ig-copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        });
      }}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

function Code({ blocks }: { blocks: { label: string; text: string }[] }) {
  const [i, setI] = useState(0);
  const b = blocks[Math.min(i, blocks.length - 1)];
  return (
    <div className="ig-code">
      <div className="ig-code-bar">
        <div className="ig-tabs" role="tablist">
          {blocks.map((x, j) => (
            <button key={x.label} type="button" role="tab" aria-selected={j === i} className={j === i ? 'on' : ''} onClick={() => setI(j)}>
              {x.label}
            </button>
          ))}
        </div>
        <Copy text={b.text} />
      </div>
      <pre>{b.text}</pre>
    </div>
  );
}

export function ConnectGuide() {
  const [origin, setOrigin] = useState('https://kavach-os.vercel.app');
  const [path, setPath] = useState<'nocode' | 'sdk'>('nocode');
  useEffect(() => setOrigin(window.location.origin), []);
  const base = `${origin}/api/gw/v1`;

  const NOCODE: Step[] = [
    {
      t: 'Add your company in Abhed',
      body: (
        <>
          Open <Link href="/connect">Connect</Link>, keep <b>No code</b> selected, type your company name and website, and press <b>Connect company</b>. Abhed shows two things: a <b>Base URL</b> and an <b>API key</b> that starts with <span className="mono">kv_gw_</span>.
        </>
      ),
      see: 'Your company appears under “In Abhed” on the Connect page. Copy the key now: it is shown only once. “New key” replaces it and switches the old one off.',
    },
    {
      t: 'Point your agents at Abhed',
      body: (
        <>
          Wherever your app sets its OpenAI-compatible model (an env file, an admin “AI provider” screen, or the SDK constructor), replace the base URL and the key. Keep your model name and your code as they are.
        </>
      ),
      code: [
        { label: '.env', text: `OPENAI_BASE_URL=${base}\nOPENAI_API_KEY=kv_gw_your_key_here` },
        { label: 'Node', text: `import OpenAI from 'openai';\n\nconst ai = new OpenAI({\n  baseURL: '${base}',\n  apiKey: process.env.ABHED_KEY, // kv_gw_…\n});` },
        { label: 'Python', text: `from openai import OpenAI\n\nai = OpenAI(\n    base_url="${base}",\n    api_key=os.environ["ABHED_KEY"],  # kv_gw_…\n)` },
      ],
      see: 'Nothing else changes: same model, same prompts, same tools. Streaming is not supported yet, so send stream: false.',
    },
    {
      t: 'Check the key',
      body: <>Ask Abhed for its model list with your key. A wrong or replaced key gets a clear 401.</>,
      code: [{ label: 'curl', text: `curl ${base}/models \\\n  -H "Authorization: Bearer kv_gw_your_key_here"` }],
      see: 'A JSON list of models. On the Connect page your row now says “key verified · waiting for the first agent message”.',
    },
    {
      t: 'Send any agent a message',
      body: (
        <>
          Use your app as normal. Abhed recognises each agent by the OpenAI <span className="mono">user</span> field, or by its system prompt (“You are Atlas…”), and lists it under your company. Actions must be OpenAI <b>tool calls</b> for Abhed to check them.
        </>
      ),
      see: 'Your row on Connect turns Connected and shows “Agent discovered: <name>” for each agent, with every call in its live log.',
    },
    {
      t: 'Watch the gate work',
      body: (
        <>
          Ask an agent to do something risky, such as a bulk export or a large refund. Abhed checks every tool call against the rulebook before your code can run it. Set your limits (hold above ₹, block above ₹, blocked tools) in your company’s row on <Link href="/connect">Connect</Link>.
        </>
      ),
      see: 'Refused calls are removed from the response with the reason. Big ones wait for a person: approve them in your row on Connect, and the agent’s next try goes through once.',
    },
  ];

  const SDK: Step[] = [
    {
      t: 'Get a pairing code',
      body: (
        <>
          Open <Link href="/connect">Connect</Link>, choose <b>Abhed SDK</b> and press <b>Generate pairing code</b>. Give the code to whoever runs the website’s admin. It expires in a few minutes.
        </>
      ),
      see: 'A six-character code and a countdown: “Waiting for a website”.',
    },
    {
      t: 'Redeem the code from your server',
      body: (
        <>
          Your server sends the code once, with its address, its industry (<span className="mono">banking</span>, <span className="mono">healthcare</span> or <span className="mono">ecommerce</span>) and its agents. Abhed answers with a <span className="mono">kv_live_</span> key for each agent. Keep them as server secrets; your own model keys never leave your server.
        </>
      ),
      code: [{ label: 'HTTP', text: `curl -X POST ${origin}/api/connect/pair \\\n  -H "content-type: application/json" \\\n  -d '{"code":"ABC123","site":{"url":"https://your-site.com","name":"Your Company","sector":"banking","agents":[{"id":"rex","name":"Rex"}]}}'\n\n→ {"ok":true,"company":"Your Company","keys":{"rex":"kv_live_…"},"record":412}` }],
      see: 'Your company appears on Connect as “Joined just now”, with its agents online on the Fleet monitor.',
    },
    {
      t: 'Add the SDK and use the keys',
      body: (
        <>
          Copy <span className="mono">sites/abhed-sdk.mjs</span> from the{' '}
          <a href="https://github.com/HarshDubey23/hackarena/blob/main/sites/abhed-sdk.mjs" target="_blank" rel="noopener noreferrer">
            repository
          </a>{' '}
          into your project (about 70 lines, no dependencies) and give each agent its key.
        </>
      ),
      code: [{ label: 'Node', text: `import { Abhed } from './abhed-sdk.mjs';\n\nconst abhed = new Abhed({ url: '${origin}', key: process.env.KAVACH_AGENT_KEY });\nconst me = await abhed.profile(); // role, limits, tool schemas` }],
      see: 'abhed.profile() returns the agent’s role, its delegated limits and the tool schemas to give your model.',
    },
    {
      t: 'Send every action through Abhed',
      body: <>Swap each direct tool call for abhed.call(). If a person must decide, wait for them; the action then runs exactly as approved.</>,
      code: [
        { label: 'Node', text: `let d = await abhed.call(session, 'issue_refund', { customer: 'C-1029', amount: 40000 });\nif (d.decision === 'NEEDS_APPROVAL') d = await abhed.waitForApproval(d.approvalId);\n// d.decision is now EXECUTED, BLOCKED or REJECTED` },
        { label: 'HTTP', text: `curl -X POST ${origin}/api/v1/tools/call \\\n  -H "Authorization: Bearer kv_live_…" -H "content-type: application/json" \\\n  -d '{"sessionId":"S-12","tool":"issue_refund","args":{"customer":"C-1029","amount":40000}}'` },
      ],
      see: 'Each call returns a decision, the rule that decided it and a ledger record number, usually in about a millisecond.',
    },
    {
      t: 'Set rules and approvers',
      body: (
        <>
          Pick a sector pack and add your own rules in plain English on the <Link href="/rules">Rulebook</Link>. Owners delegate limits (“Rex may refund up to ₹10,000”), and approvers install the <Link href="/approver">approver app</Link> on their phones.
        </>
      ),
      see: 'Your agents show on the Fleet monitor; every decision lands on the Ledger.',
    },
  ];

  const steps = path === 'nocode' ? NOCODE : SDK;
  return (
    <section className="ig" aria-labelledby="ig-h">
      <div className="ig-head">
        <div>
          <p className="kicker">Connect your own website</p>
          <h2 id="ig-h">Step by step, from zero to governed.</h2>
          <p className="ig-sub">Pick the way your agents work today. Both take minutes, and both are live the moment you finish.</p>
        </div>
        <div className="seg ig-seg" role="tablist" aria-label="How your agents work">
          <button role="tab" aria-selected={path === 'nocode'} className={path === 'nocode' ? 'on' : ''} onClick={() => setPath('nocode')}>
            No code · 5 steps
          </button>
          <button role="tab" aria-selected={path === 'sdk'} className={path === 'sdk' ? 'on' : ''} onClick={() => setPath('sdk')}>
            With the SDK · 5 steps
          </button>
        </div>
      </div>
      <p className="ig-when">
        {path === 'nocode'
          ? 'Use this if your agents already call an OpenAI-compatible model (OpenAI, Groq, Together, a LangChain or CrewAI app…). You change two settings and no code.'
          : 'Use this for a bank, hospital or e-commerce site that wants each action to wait for a person before it runs, with its own model keys staying on its server. Any other kind of website: use No code.'}
      </p>
      <ol className="ig-steps">
        {steps.map((s, i) => (
          <li key={s.t} className="ig-step">
            <span className="ig-n" aria-hidden="true">
              {i + 1}
            </span>
            <div className="ig-body">
              <h3>{s.t}</h3>
              <p>{s.body}</p>
              {s.code && <Code blocks={s.code} />}
              <div className="ig-see">
                <b>You should see</b>
                <span>{s.see}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {path === 'nocode' && (
        <div className="ig-trouble">
          <h3>If something goes wrong</h3>
          <dl>
            <dt>401 · Unknown Abhed gateway key</dt>
            <dd>The key is wrong or was replaced by “New key”. Make a new key in your row on Connect and paste that one.</dd>
            <dt>fetch failed or a timeout</dt>
            <dd>The base URL is wrong. It must be exactly {base}, without /chat/completions at the end.</dd>
            <dt>400 · Streaming is not supported</dt>
            <dd>Send stream: false. Everything else in the OpenAI request stays the same.</dd>
            <dt>The agent shows up as “Agent 3F2A”</dt>
            <dd>Abhed could not find a name. Start the system prompt with “You are &lt;Name&gt;” or set the OpenAI user field.</dd>
          </dl>
        </div>
      )}
    </section>
  );
}
