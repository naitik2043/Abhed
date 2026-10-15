import { anchorDigest, BLOCK_EVERY, sealBlock, unsealedCount } from './chain';
import { getWorld, mutate } from './store';

/** Seal pending ledger records into a signed block and anchor it publicly. */
export async function sealAndAnchor(opts: { force?: boolean; tenant?: string } = {}) {
  const w0 = await getWorld(opts.tenant);
  if (!opts.force && unsealedCount(w0) < BLOCK_EVERY) return null;
  const { result: block } = await mutate((w) => (opts.force || unsealedCount(w) >= BLOCK_EVERY ? sealBlock(w) : null), opts.tenant);
  if (!block) return null;
  const anchor = await anchorDigest(block.hash);
  await mutate((w) => {
    const b = w.blocks?.find((x) => x.height === block.height && x.hash === block.hash);
    if (b) b.anchor = anchor;
    return null;
  }, opts.tenant);
  return { ...block, anchor };
}
