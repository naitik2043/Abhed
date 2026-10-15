import { after, NextResponse } from 'next/server';
import { GovError } from './engine';
import { BLOCK_EVERY, unsealedCount } from './chain';
import { pushApprovals } from './push';
import { sealAndAnchor } from './sealer';
import { mutate } from './store';
import type { Approval, World } from './types';
import { buildView } from './view';

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'cache-control': 'no-store' } });

/**
 * Run a governed mutation. Gov errors still persist side effects (e.g. a VOID record) and return 4xx.
 * Any approval created by the mutation buzzes the approvers' phones after the response is sent.
 */
export async function govMutate<T>(fn: (w: World) => T, opts: { view?: boolean; tenant?: string } = {}) {
  try {
    let created: Approval[] = [];
    const { world, result } = await mutate((w) => {
      const before = new Set(w.approvals.map((a) => a.id));
      try {
        const value = fn(w);
        created = w.approvals.filter((a) => !before.has(a.id) && a.status === 'PENDING');
        return { ok: true as const, value };
      } catch (e) {
        if (e instanceof GovError) return { ok: false as const, error: e.message, status: e.status };
        throw e;
      }
    }, opts.tenant);
    if (created.length) after(() => pushApprovals(created));
    if (unsealedCount(world) >= BLOCK_EVERY) after(() => sealAndAnchor({ tenant: world.sector }).then(() => undefined, () => undefined));
    const view = opts.view === false ? undefined : buildView(world);
    if (!result.ok) return json({ error: result.error, view }, result.status);
    return json({ result: result.value, view });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500);
  }
}

export function directorAllowed(req: Request) {
  const need = process.env.DIRECTOR_KEY;
  if (!need) return true;
  return req.headers.get('x-director-key') === need;
}
