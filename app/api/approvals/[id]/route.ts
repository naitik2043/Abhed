import { after } from 'next/server';
import { govMutate, json } from '@/lib/api';
import { tokensFrom } from '@/lib/approver-auth';
import { escalateApproval, holdApproval, releaseHold } from '@/lib/approvals';
import { actionHash, agent, GovError, human, nameOf, tenantOfApproval } from '@/lib/engine';
import { canDecide } from '@/lib/people';
import { pushApprovals } from '@/lib/push';
import { decideAndResume, driveRun } from '@/lib/runs';
import { packFor } from '@/lib/sectors';
import { getWorld } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tenant = tenantOfApproval(id);
  const w = await getWorld(tenant);
  const ap = w.approvals.find((a) => a.id === id);
  if (!ap) return json({ error: 'Approval not found' }, 404);
  const a = agent(w, ap.req.actorId);
  const me = tokensFrom(req).find((t) => t.tenant === tenant);
  const h = me ? human(w, me.humanId) : undefined;
  return json({
    approval: { ...ap, currentHash: actionHash(ap.req), assigneeNames: (ap.assignees ?? []).map((x) => nameOf(w, x)) },
    agent: a ? { name: a.name, framework: a.framework, model: a.model, risk: a.risk, ownerName: nameOf(w, a.owner), purpose: a.purpose } : null,
    proposer: !a ? human(w, ap.req.actorId)?.name ?? null : null,
    ownerName: ap.ownerId ? nameOf(w, ap.ownerId) : null,
    now: Date.now(),
    tenant,
    company: packFor(w.sector).company,
    me: h ? { id: h.id, name: h.name, title: h.title, roles: h.roles, can: canDecide(h, ap) } : null,
  });
}

/** Every decision needs a signed-in approver of this company. Typed names are not trusted. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tenant = tenantOfApproval(id);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const me = tokensFrom(req, body).find((t) => t.tenant === tenant);
  if (!me) return json({ error: `Sign in as a ${packFor(tenant).company.replace(' (fictional)', '')} approver first.`, needSignIn: true, tenant }, 401);
  const action = String(body.decision ?? 'approve');
  let runId: string | undefined;
  let escalated: string | undefined;
  const res = await govMutate(
    (w) => {
      if (action === 'hold') return { status: holdApproval(w, id, me.humanId, String(body.note ?? '')).status, hold: true };
      if (action === 'release') return { status: releaseHold(w, id, me.humanId).status };
      if (action === 'escalate') {
        const ap = escalateApproval(w, id, me.humanId, String(body.note ?? ''));
        escalated = ap.id;
        return { status: ap.status, approverRole: ap.approverRole };
      }
      if (action !== 'approve' && action !== 'reject') throw new GovError('Unknown decision', 400);
      const r = decideAndResume(w, id, {
        decision: action,
        name: '',
        approverId: me.humanId,
        actionHash: String(body.actionHash ?? ''),
        decisionMs: Number(body.decisionMs ?? 99999),
        evidenceViewed: Boolean(body.evidenceViewed),
        device: String(body.device ?? 'phone').slice(0, 40),
      });
      runId = r.runId;
      const ap = r.ap;
      return { status: ap.status, votes: ap.votes.length, twoKey: ap.twoKey, executedSeq: ap.executedSeq ?? null, runId: ap.runId ?? null };
    },
    { tenant, view: false },
  );
  if (runId) after(() => driveRun(runId!, { tenant }));
  if (escalated)
    after(async () => {
      const ap = (await getWorld(tenant)).approvals.find((a) => a.id === escalated);
      if (ap) await pushApprovals([ap]);
    });
  return res;
}
