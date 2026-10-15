import { describe, expect, it } from 'vitest';
import { activeWorlds, conn, forgetConnection, getRegistry, isConnected, issueCode, pair, removeCompany, resetDemo } from '../lib/connect';
import { getWorld } from '../lib/store';

const site = { url: 'https://bazaar.example', name: 'Bazaar.in', sector: 'ecommerce', agents: [{ id: 'shoppy', name: 'Shoppy' }, { id: 'pricer', name: 'Pricer' }] };

describe('Companies join Abhed live', () => {
  it('starts with only NovaBank in Abhed', async () => {
    await resetDemo();
    expect((await activeWorlds()).map((w) => w.sector)).toEqual(['banking']);
    forgetConnection('ecommerce');
    expect(await isConnected('ecommerce')).toBe(false);
  });

  it('a website redeems a one-time code, introduces itself, and appears fresh with the industry rulebook', async () => {
    const code = await issueCode();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    const r = await pair(code.toLowerCase(), site);
    if (!r.ok) throw new Error(r.error);
    expect(r.tenant).toBe('ecommerce');
    expect(Object.keys(r.keys)).toContain('shoppy');
    const w = await getWorld('ecommerce');
    expect(conn(w).status).toBe('connected');
    expect(conn(w).agents).toEqual(['shoppy', 'pricer']);
    expect(w.ledger.map((x) => x.action)).toEqual(['connect_site']);
    expect(conn(w).timeline.some((t) => /rulebook applied/.test(t.text))).toBe(true);
    expect((await activeWorlds()).map((x) => x.sector)).toEqual(['banking', 'ecommerce']);
    expect((await getRegistry()).code).toBeNull();
    expect((await pair(code, site)).ok).toBe(false);
  });

  it('removing a company hides it and refuses its keys; reset brings back the opening state', async () => {
    await removeCompany('ecommerce');
    expect(await isConnected('ecommerce')).toBe(false);
    expect((await activeWorlds()).map((x) => x.sector)).toEqual(['banking']);
    await removeCompany('banking');
    expect((await activeWorlds()).length).toBe(0);
    await resetDemo();
    expect((await activeWorlds()).map((x) => x.sector)).toEqual(['banking']);
  });
});
