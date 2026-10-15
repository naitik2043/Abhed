import { json } from '@/lib/api';
import { identities } from '@/lib/approver-auth';
import { human } from '@/lib/engine';
import { canDecide } from '@/lib/people';
import { packFor } from '@/lib/sectors';
import { activeWorlds } from '@/lib/connect';

export const dynamic = 'force-dynamic';

/** One phone covers every company. Signed in, each request says whether *you* can decide it. */
export async function GET(req: Request) {
  const me = await identities(req);
  const worlds = await activeWorlds();
  const pending = worlds
    .flatMap((w) => {
      const mine = me.find((m) => m.tenant === w.sector);
      const h = mine ? human(w, mine.humanId) : undefined;
      return w.approvals
        .filter((a) => a.status === 'PENDING')
        .map((a) => {
          const can = h ? canDecide(h, a) : null;
          return {
            id: a.id,
            tenant: w.sector,
            company: packFor(w.sector).company,
            kind: a.kind,
            summary: a.summary,
            why: a.why,
            amount: typeof a.req.params.amount === 'number' ? a.req.params.amount : null,
            actor: w.agents.find((x) => x.id === a.req.actorId)?.name ?? w.humans.find((x) => x.id === a.req.actorId)?.name ?? a.req.actorId,
            createdAt: a.createdAt,
            expiresAt: a.expiresAt,
            approverRole: a.approverRole,
            twoKey: a.twoKey,
            votes: a.votes.map((v) => v.name),
            hold: a.hold ?? null,
            assignees: (a.assignees ?? []).map((x) => w.humans.find((p) => p.id === x)?.name ?? x),
            assignedToMe: Boolean(h && a.assignees?.includes(h.id)),
            canDecide: can ? can.ok : null,
            cannotWhy: can && !can.ok ? can.why : undefined,
            escalationLevel: a.escalationLevel,
          };
        });
    })
    .sort((a, b) => Number(b.assignedToMe) - Number(a.assignedToMe) || b.createdAt - a.createdAt);
  const recent = worlds
    .flatMap((w) => w.approvals.filter((a) => a.status !== 'PENDING').slice(-6).map((a) => ({ id: a.id, company: packFor(w.sector).company, status: a.status, summary: a.summary, by: a.votes.map((v) => v.name).join(' + '), at: a.usedAt ?? a.votes[a.votes.length - 1]?.at ?? a.createdAt })))
    .sort((a, b) => b.at - a.at)
    .slice(0, 8);
  return json({ now: Date.now(), me, pending, recent });
}
