import { after } from 'next/server';
import { directorAllowed, govMutate, json } from '@/lib/api';
import { decideAndResume, driveRun } from '@/lib/runs';
import {
  confirmCause,
  decideApproval,
  disputeRecord,
  GovError,
  pauseAgent,
  proposeRule,
  restore,
  restrictAgent,
  resumeAgent,
  reuseApproval,
  runReplay,
  tamper,
  actionHash,
} from '@/lib/engine';
import { llmPlan } from '@/lib/planner';
import { applyRexRun, applyRogue, applyRunaway, applyTwinRun, POISONED_TICKET, REX_TICKET } from '@/lib/scenarios';
import { getWorld, isTenant, resetWorld, storeKind, withTenant } from '@/lib/store';
import { buildView } from '@/lib/view';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!directorAllowed(req)) return json({ error: 'Director key required' }, 401);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (k: string, d = '') => (typeof body[k] === 'string' ? (body[k] as string) : d);
  const n = (k: string) => Number(body[k]);
  // the fleet dashboard acts on any company: pin the tenant for everything below
  if (isTenant(body.tenant) && !body.__pinned) return withTenant(body.tenant, () => handle(body));
  return handle(body);

  async function handle(body: Record<string, unknown>) {
  switch (body.type) {
    case 'reset': {
      const w = await resetWorld({ sector: s('sector') || undefined, history: body.history === undefined ? undefined : Boolean(body.history) });
      return json({ result: 'reset', view: buildView(w), store: storeKind() });
    }
    case 'rex_run': {
      const w0 = await getWorld();
      const text = w0.tickets.find((t) => t.id === '#8811')?.text ?? REX_TICKET;
      const plan = await llmPlan(text, { role: 'Rex, the refunds agent', customerId: 'C-1029', customerCount: w0.customerCount });
      // Rex may only refund the ticket's own customer; an LLM can't widen that
      plan.actions = plan.actions.map((a) => (a.action === 'issue_refund' ? { ...a, params: { amount: a.params.amount, customer: 'C-1029', to_account: 'own' } } : a));
      return govMutate((w) => applyRexRun(w, plan));
    }
    case 'twin_run': {
      const w0 = await getWorld();
      const text = s('text', POISONED_TICKET).slice(0, 2000) || POISONED_TICKET;
      const plan = await llmPlan(text, { role: 'Aria, the support agent', customerId: 'C-6120', customerCount: w0.customerCount });
      return govMutate((w) => applyTwinRun(w, plan, text));
    }
    case 'reuse':
      return govMutate((w) => {
        const ap = w.approvals.find((a) => a.id === s('approvalId'));
        if (!ap) throw new GovError('Approval not found', 404);
        const params = { ...ap.req.params };
        if (typeof params.amount === 'number') params.amount = params.amount + (Number.isFinite(n('delta')) ? n('delta') : 1);
        return reuseApproval(w, ap.id, params);
      });
    case 'presenter_approve': {
      let runId: string | undefined;
      const res = await govMutate((w) => {
        const ap = w.approvals.find((a) => a.id === s('approvalId'));
        if (!ap) throw new GovError('Approval not found', 404);
        const r = decideAndResume(w, ap.id, {
          decision: 'approve',
          name: s('name', 'Meera Iyer'),
          actionHash: actionHash(ap.req),
          decisionMs: 9000,
          evidenceViewed: true,
          device: 'laptop',
        });
        runId = r.runId;
        return r.ap.status;
      });
      if (runId) after(() => driveRun(runId!));
      return res;
    }
    case 'pause':
      return govMutate((w) => pauseAgent(w, s('agentId'), s('by', 'priya'), s('reason', 'Paused from the Command Center')));
    case 'restrict':
      return govMutate((w) => restrictAgent(w, s('agentId'), s('by', 'priya')));
    case 'resume':
      return govMutate((w) => {
        const a = w.agents.find((x) => x.id === s('agentId'));
        return resumeAgent(w, s('agentId'), s('by', a?.owner ?? ''), s('reason', 'Reviewed by owner'));
      });
    case 'dispute':
      return govMutate((w) => disputeRecord(w, n('seq'), s('by', 'isha')).id);
    case 'confirm_cause':
      return govMutate((w) => confirmCause(w, s('incidentId'), s('by', 'meera'), s('cause', 'Policy gap')).id);
    case 'replay':
      return govMutate((w) => runReplay(w, s('incidentId')).replay);
    case 'propose_rule':
      return govMutate((w) => proposeRule(w, s('incidentId'), s('by', 'arjun')));
    case 'tamper':
      return govMutate((w) => tamper(w));
    case 'restore':
      return govMutate((w) => restore(w));
    case 'rogue':
      return govMutate((w) => applyRogue(w));
    case 'runaway':
      return govMutate((w) => applyRunaway(w).length);
    default:
      return json({ error: `Unknown command ${String(body.type)}` }, 400);
  }
}
}
