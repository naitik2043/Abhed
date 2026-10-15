import { after } from 'next/server';
import { adminOp, adminOverview, labReport } from './admin';
import { json } from './api';
import { GovError } from './engine';
import { pushApprovals } from './push';
import { driveRun } from './runs';
import { getWorld, mutate, type Tenant } from './store';

export async function adminGet(req: Request, tenant: Tenant) {
  const w = await getWorld(tenant);
  const batch = new URL(req.url).searchParams.get('report');
  if (batch) return json(labReport(w, batch));
  return json(adminOverview(w));
}

export async function adminPost(req: Request, tenant: Tenant) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    let push: string | undefined;
    let run: string | undefined;
    const { result } = await mutate((w) => {
      try {
        const r = adminOp(w, String(body.op ?? ''), body);
        push = r.pushApprovalId;
        run = r.startRunId;
        return { ok: true as const, value: r.result };
      } catch (e) {
        if (e instanceof GovError) return { ok: false as const, error: e.message, status: e.status };
        throw e;
      }
    }, tenant);
    if (!result.ok) return json({ error: result.error }, result.status);
    if (run) after(() => driveRun(run!, { tenant }));
    if (push)
      after(async () => {
        const ap = (await getWorld(tenant)).approvals.find((a) => a.id === push);
        if (ap) await pushApprovals([ap]);
      });
    return json({ result: result.value });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
}
