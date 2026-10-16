import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { supabaseApiHeaders } from './supabase-headers';

/**
 * Accounts for the Abhed site: sign up, sign in, the signed-in person, sign out, and contact messages.
 *
 * In production these live in Postgres tables that the API roles cannot read at all. The server talks to a few
 * SECURITY DEFINER functions (abhed_signup, abhed_signin, abhed_profile, abhed_profile_save, abhed_avatar, abhed_logout,
 * abhed_contact): passwords are bcrypt-hashed inside the database, a session is a random token whose hash is
 * stored, and no function ever returns a password hash. Without a database (local runs and tests) the same
 * rules run in memory with scrypt.
 */
export interface Account {
  id: string;
  email: string;
  name: string;
  company: string | null;
  role: string | null;
  created_at: string;
  last_login_at?: string | null;
  title?: string | null;
  phone?: string | null;
  location?: string | null;
  website?: string | null;
  bio?: string | null;
  /** Changes whenever the photo changes; null when there is no photo. */
  avatar_v?: number | null;
}
/** The fields a person can edit on their profile. An empty avatar removes the photo. */
export type ProfilePatch = Partial<Record<'name' | 'company' | 'role' | 'title' | 'phone' | 'location' | 'website' | 'bio' | 'avatar', string>>;
const LIMITS: Record<keyof ProfilePatch, number> = { name: 80, company: 80, role: 40, title: 80, phone: 30, location: 80, website: 200, bio: 400, avatar: 400_000 };
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
export type AuthResult = { ok: true; token: string; account: Account } | { ok: false; error: string; status: number };

export const SESSION_COOKIE = 'abhed_session';
export const SESSION_DAYS = 7;

const MESSAGES: Record<string, [string, number]> = {
  bad_email: ['That email address doesn’t look right.', 400],
  weak_password: ['Use at least 8 characters for the password.', 400],
  bad_name: ['Tell us your name (at least 2 characters).', 400],
  email_taken: ['An account with this email already exists. Sign in instead.', 409],
  invalid: ['Email or password is incorrect.', 401],
  locked: ['Too many wrong attempts. Try again in 15 minutes.', 429],
  busy: ['A lot is happening right now. Try again in a minute.', 429],
  short_message: ['Write a little more (at least 10 characters).', 400],
  signed_out: ['Your session has ended. Sign in again.', 401],
  bad_photo: ['Use a JPG, PNG or WebP photo under 300 KB.', 400],
  bad_website: ['The website should start with https://', 400],
};
const fail = (code: string): { ok: false; error: string; status: number } => {
  const [error, status] = MESSAGES[code] ?? ['Something went wrong. Try again.', 500];
  return { ok: false, error, status };
};

// ───────── Postgres (production) ─────────
function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ data?: T; code?: string }> {
  const c = db()!;
  const r = await fetch(`${c.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: supabaseApiHeaders(c.key),
    body: JSON.stringify(args),
    cache: 'no-store',
  });
  const j = (await r.json().catch(() => null)) as unknown;
  if (!r.ok) return { code: (j as { message?: string } | null)?.message ?? 'error' };
  return { data: j as T };
}

// ───────── memory (local runs and tests): same rules ─────────
type MemAccount = Account & { hash: string; failed: number; lockedUntil: number; avatar?: string | null };
type MemStore = { accounts: MemAccount[]; sessions: Map<string, { id: string; exp: number }>; messages: unknown[] };
const mem = globalThis as unknown as { __abhedAccounts?: MemStore };
const store = (): MemStore => (mem.__abhedAccounts ??= { accounts: [], sessions: new Map(), messages: [] });
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const hashPw = (pw: string, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
const checkPw = (pw: string, stored: string) => {
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex');
  const b = scryptSync(pw, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
};
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const strip = ({ hash: _h, failed: _f, lockedUntil: _l, avatar: _a, ...a }: MemAccount): Account => a;
function memSession(id: string) {
  const token = randomBytes(32).toString('hex');
  store().sessions.set(sha(token), { id, exp: Date.now() + SESSION_DAYS * 864e5 });
  return token;
}
const memMe = (token: string) => {
  const s = store().sessions.get(sha(token));
  if (!s || s.exp < Date.now()) return null;
  return store().accounts.find((a) => a.id === s.id) ?? null;
};
const clean = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

// ───────── public API ─────────
export async function signUp(input: { email: string; password: string; name: string; company?: string; role?: string }): Promise<AuthResult> {
  const email = clean(input.email, 160).toLowerCase();
  if (db()) {
    const r = await rpc<(Account & { token: string })[]>('abhed_signup', { p_email: email, p_password: input.password ?? '', p_name: clean(input.name, 80), p_company: clean(input.company, 80), p_role: clean(input.role, 40) });
    if (r.code || !r.data?.[0]) return fail(r.code ?? 'error');
    const { token, ...account } = r.data[0];
    return { ok: true, token, account };
  }
  if (!EMAIL.test(email)) return fail('bad_email');
  if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 200) return fail('weak_password');
  if (clean(input.name, 80).length < 2) return fail('bad_name');
  if (store().accounts.some((a) => a.email === email)) return fail('email_taken');
  const a: MemAccount = { id: randomBytes(16).toString('hex'), email, name: clean(input.name, 80), company: clean(input.company, 80) || null, role: clean(input.role, 40) || null, created_at: new Date().toISOString(), last_login_at: new Date().toISOString(), hash: hashPw(input.password), failed: 0, lockedUntil: 0 };
  store().accounts.push(a);
  return { ok: true, token: memSession(a.id), account: strip(a) };
}

export async function signIn(emailIn: string, password: string): Promise<AuthResult> {
  const email = clean(emailIn, 160).toLowerCase();
  if (db()) {
    const r = await rpc<(Account & { status: string; token: string })[]>('abhed_signin', { p_email: email, p_password: password ?? '' });
    const row = r.data?.[0];
    if (r.code || !row) return fail(r.code ?? 'error');
    if (row.status !== 'ok') return fail(row.status);
    const { token, status: _s, ...account } = row;
    return { ok: true, token, account };
  }
  const a = store().accounts.find((x) => x.email === email);
  if (!a) return fail('invalid');
  if (a.lockedUntil > Date.now()) return fail('locked');
  if (!checkPw(password ?? '', a.hash)) {
    a.failed += 1;
    if (a.failed >= 8) a.lockedUntil = Date.now() + 15 * 60_000;
    return fail('invalid');
  }
  a.failed = 0;
  a.lockedUntil = 0;
  a.last_login_at = new Date().toISOString();
  return { ok: true, token: memSession(a.id), account: strip(a) };
}

export async function currentAccount(token: string | undefined | null): Promise<Account | null> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  if (db()) {
    const r = await rpc<Account | null>('abhed_profile', { p_token: token });
    return r.data ?? null;
  }
  const a = memMe(token);
  return a ? strip(a) : null;
}

export async function signOut(token: string | undefined | null) {
  if (!token) return;
  if (db()) await rpc('abhed_logout', { p_token: token });
  else store().sessions.delete(sha(token));
}

/** Save the fields present in the patch; fields left out keep their value. */
export async function saveProfile(token: string, patch: ProfilePatch): Promise<{ ok: true; account: Account } | { ok: false; error: string; status: number }> {
  const p: ProfilePatch = {};
  for (const k of Object.keys(LIMITS) as (keyof ProfilePatch)[]) if (typeof patch[k] === 'string') p[k] = k === 'avatar' ? patch[k] : clean(patch[k], LIMITS[k]);
  if (p.name !== undefined && p.name.length < 2) return fail('bad_name');
  if (p.avatar && (p.avatar.length > LIMITS.avatar || !PHOTO.test(p.avatar))) return fail('bad_photo');
  if (p.website && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(p.website)) return fail('bad_website');
  if (db()) {
    const r = await rpc<Account | null>('abhed_profile_save', { p_token: token, p });
    if (r.code || !r.data) return fail(r.code ?? 'signed_out');
    return { ok: true, account: r.data };
  }
  const a = memMe(token);
  if (!a) return fail('signed_out');
  for (const [k, v] of Object.entries(p) as [keyof ProfilePatch, string][]) {
    if (k === 'avatar') {
      a.avatar = v || null;
      a.avatar_v = v ? Date.now() : null;
    } else if (k === 'name') a.name = v;
    else a[k] = v || null;
  }
  return { ok: true, account: strip(a) };
}

/** The signed-in person's photo as a data URL, or null. */
export async function avatarOf(token: string | undefined | null): Promise<string | null> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  if (db()) return (await rpc<string | null>('abhed_avatar', { p_token: token })).data ?? null;
  return memMe(token)?.avatar ?? null;
}

export async function sendMessage(input: { name: string; email: string; topic?: string; message: string }, token?: string | null): Promise<{ ok: true; id: number } | { ok: false; error: string; status: number }> {
  if (db()) {
    const r = await rpc<number>('abhed_contact', { p_name: clean(input.name, 80), p_email: clean(input.email, 160), p_topic: clean(input.topic, 40), p_message: clean(input.message, 4000), p_token: token ?? '' });
    if (r.code || typeof r.data !== 'number') return fail(r.code ?? 'error');
    return { ok: true, id: r.data };
  }
  if (clean(input.name, 80).length < 2) return fail('bad_name');
  if (!EMAIL.test(clean(input.email, 160))) return fail('bad_email');
  if (clean(input.message, 4000).length < 10) return fail('short_message');
  store().messages.push({ ...input, at: Date.now() });
  return { ok: true, id: store().messages.length };
}

/** The session token from a request's cookie header. */
export function tokenFrom(req: Request) {
  const m = /(?:^|;\s*)abhed_session=([0-9a-f]{64})/.exec(req.headers.get('cookie') ?? '');
  return m?.[1] ?? null;
}

/** Same-site check for state-changing auth requests (the cookie is also SameSite=Lax). */
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get('x-forwarded-host') ?? req.headers.get('host'));
  } catch {
    return false;
  }
}
