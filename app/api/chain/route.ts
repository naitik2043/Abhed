import { json } from '@/lib/api';
import { inclusionProof, publicKeyHex, unsealedCount, verifyChain } from '@/lib/chain';
import { sealAndAnchor } from '@/lib/sealer';
import { getWorld } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  const w = await getWorld();
  const seq = Number(new URL(req.url).searchParams.get('proof'));
  if (Number.isFinite(seq) && seq > 0) {
    const p = inclusionProof(w, seq);
    return p ? json(p) : json({ error: `Record #${seq} is not sealed yet` }, 404);
  }
  return json({
    publicKey: publicKeyHex(),
    verify: verifyChain(w),
    unsealed: unsealedCount(w),
    blocks: [...(w.blocks ?? [])].reverse().map(({ anchor, ...b }) => ({ ...b, anchor: anchor ? { service: anchor.service, status: anchor.status, at: anchor.at, error: anchor.error, receiptBytes: anchor.receipt ? Buffer.from(anchor.receipt, 'base64').length : 0 } : undefined })),
  });
}

/** Seal now (instead of waiting for 25 records) and anchor the block publicly. */
export async function POST() {
  const block = await sealAndAnchor({ force: true });
  if (!block) return json({ error: 'Nothing to seal: every record is already in a block.' }, 409);
  return json({ result: { height: block.height, hash: block.hash, count: block.count, anchor: { service: block.anchor.service, status: block.anchor.status, error: block.anchor.error } } });
}
