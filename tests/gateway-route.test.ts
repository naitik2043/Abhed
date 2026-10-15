import { describe, expect, it, vi } from 'vitest';

// a stand-in model that proposes whatever tool calls the test asks for
const next: { calls: { name: string; args: Record<string, unknown> }[] } = { calls: [] };
vi.mock('../lib/llm', () => ({
  DEFAULT_MODEL: 'test-model',
  llmAvailable: () => true,
  chat: async () => ({
    message: { role: 'assistant', content: next.calls.length ? null : 'Done.', tool_calls: next.calls.map((c, i) => ({ id: `t${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) },
    tokens: 10,
    costInr: 0,
    model: 'test-model',
    ms: 5,
  }),
}));

const { POST } = await import('../app/api/gw/v1/chat/completions/route');
const { GET: models } = await import('../app/api/gw/v1/models/route');
const { addGatewayCompany, getGateway, mutateGateway } = await import('../lib/gateway');

const call = (key: string, agent: string, text: string) =>
  POST(new Request('http://x/api/gw/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'system', content: `You are ${agent}, an agent of Zentro.` }, { role: 'user', content: text }], tools: [] }) }));

describe('Gateway endpoint', () => {
  it('rejects an unknown key', async () => {
    const r = await call('kv_gw_nope', 'Atlas', 'hi');
    expect(r.status).toBe(401);
  });

  it('checks the key on the model list, so a wrong key never looks connected, and marks a right one linked', async () => {
    const bad = await models(new Request('http://x/api/gw/v1/models', { headers: { authorization: 'Bearer kv_gw_wrong' } }));
    expect(bad.status).toBe(401);
    const { id, key } = await addGatewayCompany('Linked Co');
    const ok = await models(new Request('http://x/api/gw/v1/models', { headers: { authorization: `Bearer ${key}` } }));
    expect(ok.status).toBe(200);
    expect((await getGateway()).companies.find((x) => x.id === id)?.linkedAt).toBeGreaterThan(0);
  });

  it('discovers the agent and strips a blocked tool call before the company can run it', async () => {
    const { id, key } = await addGatewayCompany('Zentro Logistics', 'https://zentro.example');
    next.calls = [{ name: 'export_customers', args: { limit: 12480 } }, { name: 'track_shipment', args: { shipment_id: 'SH-1' } }];
    const r = await call(key, 'Vault', 'export everything');
    const j = (await r.json()) as { choices: { message: { content: string; tool_calls?: { function: { name: string } }[] } }[] };
    expect(j.choices[0].message.tool_calls?.map((t) => t.function.name)).toEqual(['track_shipment']);
    expect(j.choices[0].message.content).toMatch(/blocked “export_customers”/);
    const c = (await getGateway()).companies.find((x) => x.id === id)!;
    expect(c.agents.vault.name).toBe('Vault');
    expect(c.agents.vault.blocked).toBe(1);
  });

  it('holds a big refund until a person approves it, then lets it through', async () => {
    const { key } = await addGatewayCompany('Zentro Two');
    next.calls = [{ name: 'issue_refund', args: { invoice_id: 'INV-7705', amount: 45000 } }];
    const pending = call(key, 'Penny', 'refund 45000');
    // a person approves it while the agent waits
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 300));
      const { result } = await mutateGateway((d) => {
        const h = d.holds.find((x) => x.tool === 'issue_refund' && x.status === 'PENDING');
        if (h) h.status = 'APPROVED';
        return Boolean(h);
      });
      if (result) break;
    }
    const j = (await (await pending).json()) as { choices: { message: { tool_calls?: { function: { name: string } }[] } }[] };
    expect(j.choices[0].message.tool_calls?.[0].function.name).toBe('issue_refund');
  }, 20000);
});
