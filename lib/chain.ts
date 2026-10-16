import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { GENESIS, hashRecord } from './engine';
import type { ChainBlock, World } from './types';
import { canonical, sha256 } from './util';

/**
 * Blockchain layer on top of the hash-chained ledger.
 * - Records are sealed into blocks. Each block commits to its records with a Merkle root and to the
 *   previous block by hash, and is signed with Abhed's Ed25519 key (public key is published).
 * - Each block hash is submitted to OpenTimestamps, which aggregates it into a Bitcoin transaction:
 *   a public, third-party proof that this exact history existed at that time. Nobody inside the
 *   company, including Abhed's operators, can rewrite a sealed record without it showing.
 */

export const BLOCK_EVERY = 25; // auto-seal once this many records are unsealed
const OTS_CALENDARS = ['https://a.pool.opentimestamps.org', 'https://b.pool.opentimestamps.org'];

// ───────── signing key ─────────
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');
let cached: { priv: KeyObject; pub: KeyObject; pubHex: string } | null = null;

function keys() {
  if (cached) return cached;
  // a 32-byte seed from KAVACH_SIGNING_SEED (hex) or derived from the server secret; never sent to the browser
  const seedHex = process.env.KAVACH_SIGNING_SEED ?? sha256(`kavach-ed25519:${process.env.KAVACH_AGENT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'local-dev'}`);
  const priv = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, Buffer.from(seedHex.slice(0, 64), 'hex')]), format: 'der', type: 'pkcs8' });
  const pub = createPublicKey(priv);
  const pubHex = (pub.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32).toString('hex');
  cached = { priv, pub, pubHex };
  return cached;
}
export const publicKeyHex = () => keys().pubHex;

// ───────── merkle ─────────
const pair = (a: string, b: string) => sha256(a + b);

export function merkleRoot(leaves: string[]): string {
  if (!leaves.length) return GENESIS;
  let level = leaves;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(pair(level[i], level[i + 1] ?? level[i]));
    level = next;
  }
  return level[0];
}

export function merkleProof(leaves: string[], index: number): { sibling: string; side: 'L' | 'R' }[] {
  const proof: { sibling: string; side: 'L' | 'R' }[] = [];
  let level = leaves;
  let i = index;
  while (level.length > 1) {
    const isRight = i % 2 === 1;
    const sib = isRight ? level[i - 1] : level[i + 1] ?? level[i];
    proof.push({ sibling: sib, side: isRight ? 'L' : 'R' });
    const next: string[] = [];
    for (let k = 0; k < level.length; k += 2) next.push(pair(level[k], level[k + 1] ?? level[k]));
    level = next;
    i = Math.floor(i / 2);
  }
  return proof;
}

export function applyProof(leaf: string, proof: { sibling: string; side: 'L' | 'R' }[]) {
  return proof.reduce((h, p) => (p.side === 'L' ? pair(p.sibling, h) : pair(h, p.sibling)), leaf);
}

const blockHash = (b: Omit<ChainBlock, 'hash' | 'signature' | 'anchor'>) =>
  sha256(canonical({ height: b.height, fromSeq: b.fromSeq, toSeq: b.toSeq, count: b.count, merkleRoot: b.merkleRoot, prevHash: b.prevHash, ts: b.ts }));

// ───────── seal ─────────
export function unsealedCount(w: World) {
  const last = w.blocks?.[w.blocks.length - 1];
  return w.ledger.filter((r) => r.seq > (last?.toSeq ?? 0)).length;
}

export function sealBlock(w: World, now = Date.now()): ChainBlock | null {
  w.blocks ??= [];
  const last = w.blocks[w.blocks.length - 1];
  const recs = w.ledger.filter((r) => r.seq > (last?.toSeq ?? 0));
  if (!recs.length) return null;
  const body = {
    height: (last?.height ?? 0) + 1,
    fromSeq: recs[0].seq,
    toSeq: recs[recs.length - 1].seq,
    count: recs.length,
    merkleRoot: merkleRoot(recs.map((r) => r.hash)),
    prevHash: last?.hash ?? GENESIS,
    ts: now,
  };
  const hash = blockHash(body);
  const signature = sign(null, Buffer.from(hash, 'hex'), keys().priv).toString('base64');
  const block: ChainBlock = { ...body, hash, signature };
  w.blocks.push(block);
  return block;
}

// ───────── verify ─────────
export function verifyChain(w: World): { valid: boolean; blocks: number; sealedRecords: number; firstBadHeight: number | null; reason?: string; publicKey: string } {
  const blocks = w.blocks ?? [];
  let prev = GENESIS;
  const pub = keys().pub;
  for (const b of blocks) {
    const recs = w.ledger.filter((r) => r.seq >= b.fromSeq && r.seq <= b.toSeq);
    const fail = (reason: string) => ({ valid: false, blocks: blocks.length, sealedRecords: b.fromSeq - 1, firstBadHeight: b.height, reason, publicKey: keys().pubHex });
    if (b.prevHash !== prev) return fail(`Block ${b.height} does not link to block ${b.height - 1}.`);
    if (recs.length !== b.count) return fail(`Block ${b.height} sealed ${b.count} records; ${recs.length} are there now.`);
    // recompute each record's hash from its content, so an edited record cannot hide behind its old hash
    const root = merkleRoot(recs.map((r) => hashRecord(r)));
    if (root !== b.merkleRoot) {
      const bad = recs.find((r) => hashRecord(r) !== r.hash);
      return fail(`Merkle root of block ${b.height} no longer matches${bad ? `: record #${bad.seq} was edited after it was sealed` : ''}.`);
    }
    if (blockHash(b) !== b.hash) return fail(`Block ${b.height} header was changed.`);
    if (!verify(null, Buffer.from(b.hash, 'hex'), pub, Buffer.from(b.signature, 'base64'))) return fail(`Signature on block ${b.height} is not Abhed's.`);
    prev = b.hash;
  }
  const last = blocks[blocks.length - 1];
  return { valid: true, blocks: blocks.length, sealedRecords: last?.toSeq ?? 0, firstBadHeight: null, publicKey: keys().pubHex };
}

/** Proof that one record is inside a sealed, signed block. Anyone can check it with SHA-256 alone. */
export function inclusionProof(w: World, seq: number) {
  const b = (w.blocks ?? []).find((x) => seq >= x.fromSeq && seq <= x.toSeq);
  if (!b) return null;
  const recs = w.ledger.filter((r) => r.seq >= b.fromSeq && r.seq <= b.toSeq);
  const idx = recs.findIndex((r) => r.seq === seq);
  const leaf = recs[idx].hash;
  const proof = merkleProof(
    recs.map((r) => r.hash),
    idx,
  );
  return { seq, leaf, block: { height: b.height, hash: b.hash, merkleRoot: b.merkleRoot, signature: b.signature, anchor: b.anchor ? { service: b.anchor.service, status: b.anchor.status, at: b.anchor.at } : undefined }, proof, recomputedRoot: applyProof(leaf, proof), publicKey: keys().pubHex };
}

// ───────── public anchoring ─────────
export async function anchorDigest(hashHex: string): Promise<NonNullable<ChainBlock['anchor']>> {
  const errors: string[] = [];
  for (const cal of OTS_CALENDARS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(`${cal}/digest`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/vnd.opentimestamps.v1', 'user-agent': 'kavach-os' },
        body: Buffer.from(hashHex, 'hex'),
      }).finally(() => clearTimeout(t));
      if (!res.ok) throw new Error(`${res.status}`);
      const receipt = Buffer.from(await res.arrayBuffer()).toString('base64');
      return { service: `OpenTimestamps (${new URL(cal).host}) → Bitcoin`, status: 'submitted', at: Date.now(), receipt };
    } catch (e) {
      errors.push(`${new URL(cal).host}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { service: 'OpenTimestamps', status: 'failed', at: Date.now(), error: errors.join('; ').slice(0, 200) };
}
