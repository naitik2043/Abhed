import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'FAQ · Abhed',
  description: 'How Abhed decides, what it stores, how companies connect, and what it costs.',
};

const GROUPS: { title: string; items: [string, React.ReactNode][] }[] = [
  {
    title: 'The product',
    items: [
      ['What does Abhed actually do?', 'It sits between an AI agent’s decision and the action. Every action (a refund, an email, an export) is checked against the company’s rulebook before it runs. Small actions go through, risky ones are refused, and big ones wait for the right person to approve on their phone. Each decision is written to a ledger that can’t be quietly edited.'],
      ['Why rules and not another AI model?', 'A model can be persuaded by a cleverly written message; a rule can’t. Rules give the same answer for the same action every time, and the record shows exactly which rule decided. Models are still used where they help: the agents themselves, and scanning text for prompt injection.'],
      ['Does it slow the agents down?', 'The gate decides in a few milliseconds. Most of an agent’s time goes to the model itself. Only actions that need a person wait, and that wait is on purpose.'],
      ['What happens if nobody answers an approval?', 'It escalates (Level 1, then Level 2, then an executive) and finally expires. Nothing is ever approved by default.'],
    ],
  },
  {
    title: 'Connecting a company',
    items: [
      ['Do we have to change our code?', <>No. If your agents use an OpenAI-compatible model (most do), change two settings: the base URL and the API key. Abhed then sees every call and every tool call. See <Link href="/story">how it works</Link> or <Link href="/connect">connect a company</Link>.</>],
      ['Can an agent bypass Abhed?', 'In a real deployment the company’s model key lives only with Abhed; agents hold an Abhed key. Without going through the gate they can’t reach the model at all, and a removed company’s key stops working at once.'],
      ['Which models and frameworks work?', 'Any OpenAI-compatible endpoint (OpenAI, Groq, Azure, OpenRouter, local models) and any framework that lets you set a base URL: the OpenAI SDK, LangChain, CrewAI, n8n and plain HTTP. For actions that don’t go through a model there is a small SDK.'],
    ],
  },
  {
    title: 'Security and data',
    items: [
      ['How do you prove the records weren’t changed?', 'Each record carries the hash of the one before it. Records are sealed into signed blocks and timestamped outside the company. Changing any past record breaks the chain at that exact record, and anyone can verify it.'],
      ['What do you store about me?', <>For an account: your name, email, company, role and a bcrypt hash of your password (never the password itself). For contact messages: what you write to us. Details are in the <Link href="/privacy">privacy policy</Link>.</>],
      ['Are the companies in the demo real?', 'No. NovaBank, Sanjeevani, Bazaar and Zentro are fictional companies built to show Abhed working on real agents, real models and real approvals.'],
    ],
  },
  {
    title: 'Pricing and accounts',
    items: [
      ['How is Abhed priced?', <>By usage: governed actions and active agents, with a free allowance every month. Checkpoints and phone approvals are never charged. Try the <Link href="/business">calculator</Link>.</>],
      ['Do I need an account to try it?', 'No. The live demo, Break Abhed and the fleet dashboard are open. An account keeps your details for when you connect your own company.'],
      ['I forgot my password.', <>Self-service reset needs email delivery, which this prototype doesn’t send yet. <Link href="/contact">Write to us</Link> from the same email and we’ll help.</>],
    ],
  },
];

export default function FaqPage() {
  return (
    <section className="st-faq">
      <div className="st-faq-head">
        <p className="st-kicker">FAQ</p>
        <h1 className="st-h1 sm">
          Questions, <em>answered plainly.</em>
        </h1>
        <p className="st-lede">
          Can’t find yours? <Link href="/contact">Ask us</Link>.
        </p>
      </div>
      <div className="st-faq-groups">
        {GROUPS.map((g) => (
          <div key={g.title} className="st-faq-group">
            <h2>{g.title}</h2>
            {g.items.map(([q, a], i) => (
              <details key={q} className="st-q" open={g.title === 'The product' && i === 0}>
                <summary>
                  <span>{q}</span>
                  <i aria-hidden="true" />
                </summary>
                <div className="st-a">{a}</div>
              </details>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
