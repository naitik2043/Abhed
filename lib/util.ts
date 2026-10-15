import { createHash } from 'node:crypto';

export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Personal data is masked before it reaches the ledger (DPDP-minded). */
export function maskValue(key: string, value: unknown): unknown {
  if (typeof value !== 'string' && typeof value !== 'number') return value;
  const s = String(value);
  const k = key.toLowerCase();
  if (k.includes('account') || k === 'to_account' || k === 'beneficiary') {
    return s.length > 4 ? `••••${s.slice(-4)}` : s;
  }
  if (k.includes('email') || k === 'to') {
    const at = s.indexOf('@');
    if (at > 0) return `${s.slice(0, Math.min(2, at))}•••${s.slice(at)}`;
    return s;
  }
  if (k.includes('phone') || k.includes('mobile')) return s.length > 4 ? `••••••${s.slice(-4)}` : s;
  if (k.includes('pan')) return s.length >= 10 ? `${s.slice(0, 5)}••••${s.slice(-1)}` : s;
  return value;
}

export function maskParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) out[k] = maskValue(k, v);
  return out;
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
