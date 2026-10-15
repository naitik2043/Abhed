import webpush from 'web-push';
import type { Approval } from './types';
import { getLive, mutateLive } from './store';

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:abhed-demo@example.com', pub, priv);
  configured = true;
  return true;
}

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;

/** Buzz every connected approver phone. Expired subscriptions are dropped. */
export async function pushApprovals(approvals: Approval[]) {
  if (!approvals.length || !configure()) return;
  const live = await getLive('banking'); // approver phones are registered once, for every company
  const subs = Object.values(live.approvers).filter((a) => a.subscription);
  const dead: string[] = [];
  await Promise.all(
    approvals.flatMap((ap) =>
      subs.map(async (s) => {
        const amount = typeof ap.req.params.amount === 'number' ? ` ₹${ap.req.params.amount.toLocaleString('en-IN')}` : '';
        const payload = JSON.stringify({
          title: ap.kind === 'rule_change' ? 'A rule wants to go live' : `Approval needed${amount}`,
          body: `${ap.summary}. ${ap.why}`.slice(0, 180),
          url: `/approve/${ap.id}`,
          tag: ap.id,
        });
        try {
          await webpush.sendNotification(s.subscription!, payload, { TTL: 600, urgency: 'high' });
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.push(s.name.toLowerCase());
        }
      }),
    ),
  );
  if (dead.length) {
    await mutateLive((l) => {
      for (const k of dead) if (l.approvers[k]) l.approvers[k].subscription = undefined;
      return null;
    }, 'banking').catch(() => undefined);
  }
}
