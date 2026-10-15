import { after } from 'next/server';
import { govMutate, json } from '@/lib/api';
import { agent, nameOf } from '@/lib/engine';
import { driveRun, llmAvailable, startRun } from '@/lib/runs';
import { packFor } from '@/lib/sectors';
import { getWorld } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The console: which agents exist in this company, what they can do, and what they are doing now. */
export async function GET(req: Request) {
  const w = await getWorld();
  const pack = packFor(w.sector);
  const runId = new URL(req.url).searchParams.get('run');
  const runs = (w.runs ?? []).map(({ llm: _l, queue: _q, ...r }) => r);
  const pending = new Map(w.approvals.filter((a) => a.status === 'PENDING').map((a) => [a.id, a]));
  return json({
    sector: { id: pack.id, company: pack.company, label: pack.label, tagline: pack.tagline },
    llm: llmAvailable(),
    agents: Object.keys(pack.agentTools).map((id) => {
      const a = agent(w, id);
      return {
        id,
        name: a?.name ?? id,
        purpose: a?.purpose,
        owner: a ? nameOf(w, a.owner) : undefined,
        status: a?.status,
        statusReason: a?.statusReason,
        model: a?.model,
        tools: (pack.agentTools[id] ?? []).map((t) => ({ name: t, label: pack.tools[t]?.label ?? t, risk: pack.tools[t]?.risk ?? 'low', delegated: Boolean(a?.delegations.some((d) => d.action === t)) || Boolean(pack.tools[t]?.readOnly || pack.tools[t]?.noDelegation) })),
      };
    }),
    examples: pack.examples,
    runs: runId ? runs.filter((r) => r.id === runId) : runs.slice(0, 12),
    pending: [...pending.values()].map((a) => ({ id: a.id, summary: a.summary, approverRole: a.approverRole, twoKey: a.twoKey, votes: a.votes.length, runId: a.runId })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let runId: string | undefined;
  const res = await govMutate(
    (w) => {
      const run = startRun(w, {
        agentId: String(body.agentId ?? ''),
        command: String(body.command ?? ''),
        by: typeof body.by === 'string' ? body.by : undefined,
        planner: body.planner === 'offline' ? 'offline' : 'llm',
      });
      runId = run.status === 'running' ? run.id : undefined;
      return { runId: run.id, status: run.status, planner: run.planner };
    },
    { view: false },
  );
  if (runId) after(() => driveRun(runId!));
  return res;
}
