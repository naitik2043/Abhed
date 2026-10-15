import { govMutate, json } from '@/lib/api';
import { gateway } from '@/lib/engine';
import { act, agentFromKey } from '@/lib/live';
import { liveEvent, mutateLive } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** The only door to tools. Agents never hold bank or provider credentials; every call is decided and ledgered here. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { action?: string; params?: Record<string, unknown>; ticketId?: string; agentName?: string };
  const agentId = agentFromKey(req.headers.get('authorization'));
  if (!agentId) {
    // shadow AI: an unregistered caller is refused fail-closed and recorded
    const who = `${String(b.agentName ?? 'unknown-agent').slice(0, 30)} (unregistered)`;
    const res = await govMutate((w) => gateway(w, { actorType: 'agent', actorId: who, action: String(b.action ?? 'unknown').slice(0, 40), params: b.params ?? {} }), { view: false });
    await mutateLive((l) => {
      liveEvent(l, { agentId: who, kind: 'decision', text: `◌ ${who} tried ${b.action}: BLOCKED (no passport, no owner)`, tone: 'block' });
      return null;
    }).catch(() => undefined);
    return res.status === 200 ? json({ decision: 'BLOCKED', reason: 'Unregistered agent: fail-closed' }, 401) : res;
  }
  const res = await govMutate((w) => {
    const r = act(w, agentId, { action: String(b.action ?? ''), params: b.params, ticketId: b.ticketId });
    const a = w.agents.find((x) => x.id === agentId)!;
    const ap = r.approvalId ? w.approvals.find((x) => x.id === r.approvalId) : undefined;
    return { ...r, agent: a.name, status: a.status, summary: ap?.summary };
  }, { view: false });
  const data = (await res.clone().json()) as { result?: { decision: string; reason: string; ruleRef?: string; approvalId?: string; paused?: boolean; agent: string; seq: number } };
  const r = data.result;
  if (r) {
    const tone = r.decision === 'ALLOWED' ? 'allow' : r.decision === 'NEEDS_APPROVAL' ? 'human' : 'block';
    await mutateLive((l) => {
      const rt = l.runtimes[agentId];
      if (rt) {
        rt.calls += 1;
        rt.lastDecision = `${String(b.action).replace(/_/g, ' ')} → ${r.decision.replace('_', ' ')}`;
        rt.lastSeen = Date.now();
      }
      liveEvent(l, {
        agentId,
        kind: 'decision',
        text: `${r.agent} · ${String(b.action).replace(/_/g, ' ')}${b.ticketId ? ` (${b.ticketId})` : ''} → ${r.decision === 'NEEDS_APPROVAL' ? `WAITING FOR A PERSON ${r.approvalId}` : r.decision}${r.ruleRef ? ` · ${r.ruleRef}` : ''}`,
        tone,
      });
      if (r.paused) liveEvent(l, { agentId, kind: 'system', text: `${r.agent} AUTO-PAUSED by Abhed: key revoked, work moved to people`, tone: 'block' });
      return null;
    }).catch(() => undefined);
  }
  return res;
}
