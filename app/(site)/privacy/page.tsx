import type { Metadata } from 'next';
import Link from 'next/link';
import { Legal } from '@/components/legal';
import { UPDATED } from '@/lib/site';

export const metadata: Metadata = { title: 'Privacy · Abhed', description: 'What Abhed stores, why, where, and how to have it removed.' };

export default function PrivacyPage() {
  return (
    <Legal
      kicker="Privacy"
      title={<>Your data, <em>kept small.</em></>}
      intro="Abhed is a working prototype. We collect only what we need to run your account and answer you, and nothing is sold or shared for advertising."
      updated={UPDATED}
      sections={[
        ['What we collect', <><p>If you create an account: your name, email, company, role, when you joined and when you last signed in. Your password is stored only as a bcrypt hash; we never see or keep the password itself.</p><p>If you write to us: your name, email, the topic and your message.</p><p>If you use the demo: what you type to the demo agents and the decisions Abhed makes, which are recorded on the demo ledger like every other action.</p></>],
        ['Why we collect it', <><p>To sign you in, to reply to you, and to show how Abhed governs agents. We don’t use your data for advertising and we don’t sell it.</p></>],
        ['Cookies and local storage', <><p>One cookie, <code>abhed_session</code>, keeps you signed in. It is HttpOnly (scripts can’t read it), limited to this site, and expires after 7 days or when you sign out. Your light or dark theme choice is kept in your browser’s local storage. There are no tracking or advertising cookies.</p></>],
        ['Where it is stored', <><p>Account data and messages are stored in a Postgres database hosted by Supabase, in tables that can’t be read through the public API. The site runs on Vercel. Demo agents send prompts to a hosted AI model to decide what to do; don’t put real personal data into the demo.</p></>],
        ['How long we keep it', <><p>Account data stays while your account exists. Sessions expire after 7 days. Messages are kept as long as needed to answer them. Demo data is reset regularly.</p></>],
        ['Your choices', <><p>You can edit your name, company and role on your <Link href="/account">account page</Link> at any time. To delete your account or messages, <Link href="/contact">write to us</Link> from the same email and we will remove them.</p></>],
        ['Security', <><p>Passwords are hashed with bcrypt, sign-in locks for 15 minutes after repeated wrong attempts, sessions are random tokens of which only a hash is stored, and the session cookie is HttpOnly and SameSite. No system is perfectly secure; if you find a weakness, please <Link href="/contact">tell us</Link>.</p></>],
        ['Changes', <><p>If this policy changes, the date at the top changes with it.</p></>],
      ]}
    />
  );
}
