import type { Metadata } from 'next';
import Link from 'next/link';
import { Legal } from '@/components/legal';
import { UPDATED } from '@/lib/site';

export const metadata: Metadata = { title: 'Terms · Abhed', description: 'The terms for using the Abhed prototype, its demo and your account.' };

export default function TermsPage() {
  return (
    <Legal
      kicker="Terms"
      title={<>Terms of use, <em>in plain words.</em></>}
      intro="By using Abhed, its demo or an account, you agree to these terms. They are short because the service is a prototype."
      updated={UPDATED}
      sections={[
        ['What Abhed is', <><p>Abhed is a working prototype of an accountability layer for AI agents, built for the CodeX 3.0 competition. It is offered as it is, for evaluation and demonstration, without any guarantee of availability or fitness for a particular purpose.</p></>],
        ['The demo', <><p>NovaBank, Sanjeevani, Bazaar, Zentro and every customer, amount and record in them are fictional. Money shown in the demo is not real money. Do not enter real personal, financial or health information.</p></>],
        ['Break Abhed', <><p>You are invited to try to make the demo agents misbehave through the Break Abhed page and the demo company websites. Attacking anything else (the hosting, the database, other people’s accounts, or trying to overload the service) is not allowed.</p></>],
        ['Your account', <><p>Keep your password to yourself; you are responsible for what happens under your account. Give accurate details. We may close accounts used to abuse the service.</p></>],
        ['Connecting your own agents', <><p>If you connect your own agents, you remain responsible for them and for the actions your systems take. Abhed’s decisions help you govern those actions; they don’t move responsibility from you to us. Test with non-production data.</p></>],
        ['Liability', <><p>To the extent the law allows, Abhed and its builders are not liable for losses arising from use of the prototype.</p></>],
        ['Privacy', <><p>How we handle your data is described in the <Link href="/privacy">privacy policy</Link>.</p></>],
        ['Changes and contact', <><p>We may update these terms; the date at the top shows when. Questions are welcome through the <Link href="/contact">contact page</Link>.</p></>],
      ]}
    />
  );
}
