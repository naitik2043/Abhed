import { describe, expect, it } from 'vitest';
import { currentAccount, sendMessage, signIn, signOut, signUp, avatarOf, saveProfile } from '../lib/accounts';

describe('Accounts', () => {
  it('signs up, refuses a duplicate, signs in, reads the session, signs out', async () => {
    const a = await signUp({ email: 'Priya@Example.com', password: 'correct horse', name: 'Priya Menon', company: 'NovaBank', role: 'Approver' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.account.email).toBe('priya@example.com');
    expect(JSON.stringify(a.account)).not.toMatch(/hash|correct horse/);
    const dup = await signUp({ email: 'priya@example.com', password: 'another one', name: 'P M' });
    expect(dup).toMatchObject({ ok: false, status: 409 });
    expect(await signIn('priya@example.com', 'nope nope')).toMatchObject({ ok: false, status: 401 });
    const b = await signIn(' PRIYA@example.com ', 'correct horse');
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect((await currentAccount(b.token))?.name).toBe('Priya Menon');
    await signOut(b.token);
    expect(await currentAccount(b.token)).toBeNull();
  });

  it('validates input and locks after 8 wrong passwords', async () => {
    expect(await signUp({ email: 'not-an-email', password: 'long enough', name: 'X Y' })).toMatchObject({ ok: false, status: 400 });
    expect(await signUp({ email: 'short@example.com', password: 'short', name: 'X Y' })).toMatchObject({ ok: false, status: 400 });
    await signUp({ email: 'lock@example.com', password: 'right password', name: 'Lock Test' });
    for (let i = 0; i < 8; i++) await signIn('lock@example.com', 'wrong password');
    expect(await signIn('lock@example.com', 'right password')).toMatchObject({ ok: false, status: 429 });
    expect(await currentAccount('not-a-token')).toBeNull();
  });

  it('updates a profile and takes contact messages', async () => {
    const a = await signUp({ email: 'arjun@example.com', password: 'twelve chars', name: 'Arjun Rao' });
    if (!a.ok) throw new Error(a.error);
    const u = await saveProfile(a.token, { name: 'Arjun R.', company: 'Bazaar', role: 'Developer', title: 'Platform lead', bio: '  Runs the agents.  ' });
    expect(u).toMatchObject({ ok: true, account: { name: 'Arjun R.', company: 'Bazaar', role: 'Developer', title: 'Platform lead', bio: 'Runs the agents.' } });
    // a partial save keeps the other fields; bad photos and websites are refused
    expect(await saveProfile(a.token, { location: 'Pune' })).toMatchObject({ ok: true, account: { title: 'Platform lead', location: 'Pune' } });
    expect(await saveProfile(a.token, { avatar: 'data:text/html;base64,PHNjcmlwdD4=' })).toMatchObject({ ok: false, status: 400 });
    expect(await saveProfile(a.token, { website: 'javascript:alert(1)' })).toMatchObject({ ok: false, status: 400 });
    const pic = 'data:image/png;base64,iVBORw0KGgo=';
    const withPic = await saveProfile(a.token, { avatar: pic });
    expect(withPic.ok && withPic.account.avatar_v).toBeTruthy();
    expect(await avatarOf(a.token)).toBe(pic);
    expect(await saveProfile(a.token, { avatar: '' })).toMatchObject({ ok: true, account: { avatar_v: null } });
    expect(await saveProfile('f'.repeat(64), { name: 'Nobody' })).toMatchObject({ ok: false, status: 401 });
    expect(await sendMessage({ name: 'A', email: 'a@b.co', message: 'hello there, team' })).toMatchObject({ ok: false, status: 400 });
    expect(await sendMessage({ name: 'Arjun', email: 'arjun@example.com', topic: 'Pilot', message: 'We want to pilot Abhed for 40 agents.' })).toMatchObject({ ok: true });
  });
});
