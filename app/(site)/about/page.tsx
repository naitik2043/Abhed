import type { Metadata } from 'next';
import Link from 'next/link';
import { LiveFeed } from '@/components/site';
import { LiveStats } from './live-stats';

export const metadata: Metadata = {
  title: 'About · Abhed',
  description: 'Why Abhed exists: AI agents now act with real permissions, and someone has to be able to say who allowed what.',
};

const PRINCIPLES = [
  ['Rules, not guesses', 'Every action an agent takes is checked by a deterministic rulebook before it runs. Same input, same decision, and the rule that decided is on the record. A model can be talked out of its instructions; a rule cannot.'],
  ['A person for the big moves', 'Small, reversible work runs on its own. Refunds above a limit, data leaving the company or a change to access wait for the right person, who approves on their phone with the evidence in front of them.'],
  ['Proof no one can edit', 'Each decision is a record chained to the one before it, sealed in signed blocks and timestamped outside the company. If anyone changes the past, the exact record shows it.'],
] as const;

const BUILT = [
  ['The gateway', 'Agents call it before they act; it decides in milliseconds.'],
  ['The rulebook', 'Plain-English rules per company, versioned, two people to change one.'],
  ['The approver app', 'A phone app for the people who sign the big moves.'],
  ['The ledger', 'Hash-chained, signed and anchored, verifiable by anyone.'],
  ['No-code connect', 'A company points its agents at Abhed with a base URL and a key.'],
  ['Break Abhed', 'Anyone can try to make our agents misbehave, live.'],
] as const;

export default function AboutPage() {
  return (
    <>
      <section className="st-hero">
        <p className="st-kicker">About Abhed</p>
        <h1 className="st-h1">
          We make AI agents <em>answerable.</em>
        </h1>
        <p className="st-lede">AI agents now refund customers, change records and send data on their own. When one gets it wrong, someone has to be able to say who allowed it, why, and prove it. Abhed is that someone’s system.</p>
        <div className="st-cta-row">
          <Link href="/demo" className="st-btn solid">
            See it decide, live
          </Link>
          <Link href="/contact" className="st-btn">
            Talk to us
          </Link>
        </div>
      </section>

      <section className="st-name">
        <div className="st-name-word" aria-hidden="true">
          अभेद
        </div>
        <div>
          <p className="st-kicker">The name</p>
          <h2 className="st-h2">Abhed means impenetrable.</h2>
          <p className="st-p">Not a wall that stops work, a gate that nothing passes without a reason. Most actions go straight through in milliseconds. The few that matter wait for a person. Every one of them is written down where no one can quietly change it.</p>
        </div>
      </section>

      <section className="st-sec">
        <p className="st-kicker">Why it exists</p>
        <div className="st-two">
          <h2 className="st-h2">Agents got permissions. Accountability didn’t come with them.</h2>
          <div className="st-p-stack">
            <p className="st-p">Companies give AI agents the same access a person has: refund up to a limit, email a customer, export a report. But a person can be asked why. An agent’s mistake usually surfaces days later, in a complaint or an audit, with no clear owner and logs anyone could have edited.</p>
            <p className="st-p">The usual answers are all-or-nothing: approve every action (and the agent becomes useless) or approve none (and one bad action costs lakhs). Text filters on the model’s output don’t catch a wrong number or a hidden instruction in a customer’s message.</p>
            <p className="st-p">Abhed sits where the agent’s decision turns into an action. It checks the action, not the words, and keeps people in charge of exactly the moments that need them.</p>
          </div>
        </div>
      </section>

      <section className="st-sec">
        <p className="st-kicker">How we think</p>
        <div className="st-cards three">
          {PRINCIPLES.map(([t, d], i) => (
            <article key={t} className="st-card">
              <span className="st-num">0{i + 1}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="st-sec">
        <div className="st-live">
          <div>
            <p className="st-kicker">Right now</p>
            <h2 className="st-h2">This isn’t a mock-up.</h2>
            <p className="st-p">These numbers and decisions come from the running system, refreshed every few seconds.</p>
            <LiveStats />
          </div>
          <div className="st-card">
            <h3 className="st-card-h">Latest decisions</h3>
            <LiveFeed rows={6} />
          </div>
        </div>
      </section>

      <section className="st-sec">
        <p className="st-kicker">What we built</p>
        <div className="st-cards three">
          {BUILT.map(([t, d]) => (
            <article key={t} className="st-card slim">
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="st-band">
        <h2 className="st-h2">Watch an agent ask for permission.</h2>
        <p className="st-p">Open the live demo, or connect your own agents with a base URL and a key.</p>
        <div className="st-cta-row">
          <Link href="/demo" className="st-btn solid">
            Start the live demo
          </Link>
          <Link href="/signup" className="st-btn">
            Create an account
          </Link>
        </div>
      </section>
    </>
  );
}
