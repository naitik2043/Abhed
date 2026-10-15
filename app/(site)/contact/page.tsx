import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactForm } from './form';

export const metadata: Metadata = {
  title: 'Contact · Abhed',
  description: 'Pilot Abhed with your agents, ask a question, or tell us what broke.',
};

export default function ContactPage() {
  return (
    <section className="st-contact">
      <div className="st-contact-l">
        <p className="st-kicker">Contact</p>
        <h1 className="st-h1 sm">
          Talk to the people <em>behind the gate.</em>
        </h1>
        <p className="st-lede">Want to put your agents behind Abhed, found something that looks wrong, or just curious how a decision was made? Write to us here; it reaches the team directly.</p>
        <ol className="st-steps">
          <li>
            <b>You write</b>
            <span>One message is enough. Tell us how many agents you run and what they do.</span>
          </li>
          <li>
            <b>We read every message</b>
            <span>Messages are stored with your name and email so we can reply. Nothing is shared.</span>
          </li>
          <li>
            <b>We reply</b>
            <span>
              Usually with a short call or a link to connect your first agent with <Link href="/connect">a base URL and a key</Link>.
            </span>
          </li>
        </ol>
        <p className="st-small">
          Looking for a quick answer? Try the <Link href="/faq">FAQ</Link>.
        </p>
      </div>
      <ContactForm />
    </section>
  );
}
