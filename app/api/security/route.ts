import { json } from '@/lib/api';
import { complianceEvidence } from '@/lib/compliance';
import { dlpScan, OWASP, scanInjection } from '@/lib/security';
import { packFor } from '@/lib/sectors';
import { getWorld } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** Security posture: events, OWASP Agentic mapping, and least-privilege findings per agent. */
export async function GET() {
  const w = await getWorld();
  const pack = packFor(w.sector);
  const since = Date.now() - 30 * 86_400_000;
  const posture = w.agents.map((a) => {
    const used = new Set(w.ledger.filter((r) => r.actorId === a.id && r.ts >= since && r.decision !== 'BLOCKED').map((r) => r.action));
    const unused = a.delegations.filter((d) => !used.has(d.action)).map((d) => d.action);
    const highRisk = a.delegations.filter((d) => pack.tools[d.action]?.risk === 'high' && d.maxPerAction === undefined).map((d) => d.action);
    return {
      id: a.id,
      name: a.name,
      status: a.status,
      delegations: a.delegations.length,
      unused,
      uncapped: highRisk,
      findings: [
        ...unused.map((x) => `Grant “${x}” unused for 30 days: revoke it (least privilege).`),
        ...highRisk.map((x) => `High-risk “${x}” has no per-action cap.`),
      ],
    };
  });
  const byOwasp = new Map<string, number>();
  for (const e of w.security ?? []) byOwasp.set(e.owasp, (byOwasp.get(e.owasp) ?? 0) + 1);
  return json({
    events: (w.security ?? []).slice(0, 80),
    owasp: Object.values(OWASP).map((k) => ({ category: k, count: byOwasp.get(k) ?? 0 })),
    posture,
    unregistered: w.unregistered,
    compliance: complianceEvidence(w),
  });
}

/** Try the scanners on any text (nothing is stored). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = String(body.text ?? '').slice(0, 4000);
  return json({ injection: scanInjection(text), dlp: dlpScan({ body: text }) });
}
