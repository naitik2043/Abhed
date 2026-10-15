import { govMutate, json } from '@/lib/api';
import { activeRules, proposeCustomRule, replayCustom, validateRule, type CustomRuleInput } from '@/lib/engine';
import { packFor } from '@/lib/sectors';
import { getWorld } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** What a company can write rules about in this sector. */
export async function GET() {
  const w = await getWorld();
  const pack = packFor(w.sector);
  return json({
    company: pack.company,
    actions: Object.values(pack.tools).filter((t) => !t.readOnly).map((t) => ({ name: t.name, label: t.label, risk: t.risk })),
    flags: [...new Set(w.rules.map((r) => r.when.flag).filter(Boolean))],
    people: w.humans.map((h) => ({ id: h.id, name: h.name, roles: h.roles })),
    rules: activeRules(w),
  });
}

/** body.dryRun → replay only; otherwise propose (needs a second person to go live). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { by?: string; rule?: CustomRuleInput; dryRun?: boolean };
  if (body.dryRun) {
    try {
      const w = await getWorld();
      const { rule, when } = validateRule(body.rule as CustomRuleInput);
      return json({ result: { rule, replay: replayCustom(w, when) } });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Invalid rule' }, 400);
    }
  }
  return govMutate((w) => proposeCustomRule(w, String(body.by ?? ''), body.rule as CustomRuleInput), { view: false });
}
