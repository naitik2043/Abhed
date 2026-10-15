import { json } from '@/lib/api';
import { addGatewayCompany, getGateway, mutateGateway, pushEvent, removeGatewayCompany, rotateKey } from '@/lib/gateway';

export const dynamic = 'force-dynamic';

const ONLINE_MS = 60_000;

/** Every no-code company: its discovered agents, the live decision stream and anything waiting for a person. */
export async function GET() {
  const d = await getGateway();
  const now = Date.now();
  return json({
    now,
    companies: d.companies.map(({ keyHash: _k, ...c }) => ({
      ...c,
      agents: Object.values(c.agents)
        .sort((a, b) => a.firstSeen - b.firstSeen)
        .map((a) => ({ ...a, online: now - a.lastSeen < ONLINE_MS })),
      events: d.events.filter((e) => e.company === c.id).slice(0, 40),
      holds: d.holds.filter((h) => h.company === c.id && h.status === 'PENDING'),
    })),
  });
}

const pinOk = (b: Record<string, unknown>) => String(b.pin ?? '') === (process.env.ADMIN_PIN ?? '2468');

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(b.id ?? '');
  switch (b.action) {
    case 'add': {
      const name = String(b.name ?? '').trim();
      if (name.length < 2) return json({ error: 'Give the company a name' }, 400);
      const site = String(b.site ?? '').trim();
      return json(await addGatewayCompany(name, site ? (/^https?:\/\//.test(site) ? site : `https://${site}`) : undefined));
    }
    case 'rotate': {
      const key = await rotateKey(id);
      return key ? json({ key }) : json({ error: 'Unknown company' }, 404);
    }
    case 'remove':
      if (!pinOk(b)) return json({ error: 'Wrong PIN' }, 403);
      await removeGatewayCompany(id);
      return json({ ok: true });
    case 'decide': {
      const decision = b.decision === 'approve' ? 'APPROVED' : 'REJECTED';
      const by = String(b.by ?? 'Guest Judge').slice(0, 40);
      const { result } = await mutateGateway((d) => {
        const h = d.holds.find((x) => x.id === String(b.holdId ?? '') && x.status === 'PENDING');
        if (!h) return false;
        h.status = decision;
        h.by = by;
        h.decidedAt = Date.now();
        pushEvent(d, { company: h.company, agent: h.agent, kind: 'decision', tool: h.tool, decision, text: `${by} ${decision === 'APPROVED' ? 'approved' : 'rejected'} ${h.tool} (${h.id})` });
        return true;
      });
      return result ? json({ ok: true }) : json({ error: 'Nothing waiting with that id' }, 404);
    }
    case 'rules': {
      const { result } = await mutateGateway((d) => {
        const c = d.companies.find((x) => x.id === id);
        if (!c) return false;
        const n = (v: unknown, dflt: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : dflt);
        c.rules = {
          holdAbove: n(b.holdAbove, c.rules.holdAbove),
          blockAbove: n(b.blockAbove, c.rules.blockAbove),
          allowedDomains: Array.isArray(b.allowedDomains) ? (b.allowedDomains as unknown[]).map(String).filter(Boolean).slice(0, 10) : c.rules.allowedDomains,
          blockTools: Array.isArray(b.blockTools) ? (b.blockTools as unknown[]).map(String).filter(Boolean).slice(0, 20) : c.rules.blockTools,
        };
        pushEvent(d, { company: c.id, agent: '', kind: 'flag', text: `Company rules updated: hold above ₹${c.rules.holdAbove.toLocaleString('en-IN')}, block above ₹${c.rules.blockAbove.toLocaleString('en-IN')}${c.rules.blockTools.length ? `, tools off: ${c.rules.blockTools.join(', ')}` : ''}` });
        return true;
      });
      return result ? json({ ok: true }) : json({ error: 'Unknown company' }, 404);
    }
    default:
      return json({ error: 'Unknown action' }, 400);
  }
}
