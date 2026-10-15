import { agentPdf } from '@/lib/agent-pdf';
import { auditPdf } from '@/lib/audit-pdf';
import { appendLedger } from '@/lib/engine';
import { packFor } from '@/lib/sectors';
import { currentTenant, mutate } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** One click: the full audit report as a PDF. The download itself is recorded in the ledger. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const by = (u.searchParams.get('by') ?? 'Auditor').slice(0, 40);
  const tenant = await currentTenant(u.searchParams.get('tenant') ?? undefined);
  const { world } = await mutate((w) => {
    appendLedger(w, { ts: Date.now(), actorType: 'human', actorId: 'auditor', actorName: by, action: 'audit_export', params: { format: 'pdf' }, decision: 'INFO', reason: `${by} downloaded the ${u.searchParams.get('agent') ? `agent report for ${u.searchParams.get('agent')}` : 'audit report'} (${w.ledger.length + 1} records).` });
    return null;
  }, tenant);
  const agentId = u.searchParams.get('agent');
  if (agentId && !world.agents.some((a) => a.id === agentId)) return new Response('Unknown agent', { status: 404 });
  const bytes = agentId ? await agentPdf(world, agentId, { requestedBy: by }) : await auditPdf(world, { requestedBy: by });
  const name = agentId ? `abhed-agent-${agentId}-${new Date().toISOString().slice(0, 10)}.pdf` : `abhed-audit-${packFor(world.sector).id}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' },
  });
}
