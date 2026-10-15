'use client';

import { useCallback, useEffect, useState } from 'react';
import { Chip, useWorld } from '@/components/app';
import { Donut, PALETTE } from '@/components/charts';

type Row = Record<string, string>;
interface Report {
  batch: string;
  company: string;
  tasks: number;
  finished: number;
  actions: number;
  allowed: number;
  held: number;
  blocked: number;
  categories: Record<string, number>;
  breachesBlocked: number;
  paused: number;
  injections: number;
  tokens: number;
  costInr: number;
  p95ms: number | null;
  rows: { id: string; agent: string; command: string; status: string; model?: string; answer?: string; steps: { kind: string; action?: string; decision?: string; reason?: string; rule?: string; text?: string }[] }[];
}

function parseCSV(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [],
    f = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        f += '"';
        i++;
      } else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(f);
      f = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f);
      f = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f);
  if (row.some((x) => x.trim())) rows.push(row);
  const h = (rows.shift() ?? []).map((x) => x.trim());
  return rows.map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export default function LabPage() {
  const { view, toast } = useWorld();
  const [kind, setKind] = useState('tasks');
  const [tables, setTables] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [batch, setBatch] = useState<string | null>(null);
  const [rep, setRep] = useState<Report | null>(null);
  const [imp, setImp] = useState<{ rows: number; table: string; pii: Record<string, number>; fingerprint: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [redteam, setRedteam] = useState(false);

  const [past, setPast] = useState<{ batch: string; tasks: number; at: number }[]>([]);
  useEffect(() => {
    fetch('/api/admin')
      .then((r) => r.json())
      .then((o) => {
        setTables(o.importable ?? []);
        setPast(o.batches ?? []);
      })
      .catch(() => undefined);
  }, [view?.sector]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? 'error');
    return j.result;
  };

  const poll = useCallback(async (b: string, expected: number) => {
    const r = await fetch(`/api/admin?report=${b}`, { cache: 'no-store' });
    if (r.ok) {
      const j = (await r.json()) as Report;
      setRep(j);
      if (j.finished < j.tasks || j.tasks < expected) setTimeout(() => poll(b, expected), 2500);
    }
  }, []);

  const run = async () => {
    const b = `L${Date.now().toString(36)}`;
    setBatch(b);
    setRep(null);
    setBusy(true);
    const q = [...rows];
    const worker = async (): Promise<void> => {
      const r = q.shift();
      if (!r) return;
      try {
        await post({ op: 'lab.start', message: r.message ?? r.task ?? r.text ?? '', customer: r.customer ?? '', agent: r.agent ?? '', batch: b, redteam });
      } catch (e) {
        toast(e instanceof Error ? e.message : 'error', 'block');
      }
      return worker();
    };
    toast(`Running ${q.length} tasks with real agents…`, 'info');
    await Promise.all([worker(), worker()]);
    setBusy(false);
    void poll(b, rows.length);
  };

  const doImport = async (replace: boolean) => {
    setBusy(true);
    try {
      setImp(await post({ op: 'data.import', table: kind, rows, mode: replace ? 'replace' : 'append' }));
      toast(`Imported ${rows.length} rows`, 'allow');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'error', 'block');
    }
    setBusy(false);
  };

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Test it on <em>your own data</em>
          </h1>
          <p className="page-sub">
            Upload records and real requests; see what each agent would do.
          </p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', marginBottom: 14, alignItems: 'start' }}>
        <div className="panel">
          <div className="panel-title">
            <span>
              <b>1 · Upload a CSV</b>
            </span>
            <a className="muted" href={`/api/lab/sample?kind=${kind}`}>
              sample {kind}.csv ↓
            </a>
          </div>
          <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
            <label className="field">
              This file is
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setRows([]);
                  setImp(null);
                }}
              >
                {['tasks', ...tables].map((k) => (
                  <option key={k} value={k}>
                    {k === 'tasks' ? 'requests for the agents' : `${k} (records)`}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              CSV
              <input type="file" accept=".csv,text/csv" onChange={async (e) => setRows(parseCSV(await (e.target.files?.[0]?.text() ?? Promise.resolve(''))).slice(0, 1000))} />
            </label>
          </div>
          {rows.length > 0 && (
            <>
              <div className="muted" style={{ margin: '10px 0', fontSize: 12.5 }}>
                {rows.length} rows · columns: {Object.keys(rows[0]).join(', ')}
              </div>
              <pre className="price-eq" style={{ fontSize: 11, maxHeight: 140, overflow: 'auto' }}>
                {rows
                  .slice(0, 4)
                  .map((r) => JSON.stringify(r))
                  .join('\n')}
              </pre>
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                {kind === 'tasks' ? (
                  <>
                    <select value={redteam ? 'red' : 'llm'} onChange={(e) => setRedteam(e.target.value === 'red')} className="pill" style={{ height: 30 }}>
                      <option value="llm">Real LLM agents (gpt-oss-120b)</option>
                      <option value="red">Red-team: compromised agent that obeys hidden instructions</option>
                    </select>
                    <button className="btn btn-solid btn-sm" disabled={busy} onClick={run}>
                      Run {rows.length} requests through the agents
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-solid btn-sm" disabled={busy} onClick={() => doImport(false)}>
                      Import into {kind}
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => doImport(true)}>
                      Replace {kind}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {!rows.length && (
            <div className="muted" style={{ marginTop: 10, fontSize: 12.5 }}>
              Requests file columns: <span className="mono">message, customer, agent</span> (customer and agent optional; Abhed routes by topic). Records files: the columns of that table, e.g. <span className="mono">id, name, email</span>.
            </div>
          )}
          {imp && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <b>
                Imported {imp.rows} rows into {imp.table}
              </b>{' '}
              · fingerprint <span className="mono">{imp.fingerprint}</span>
              <div className="muted">
                Personal data found:{' '}
                {Object.entries(imp.pii)
                  .map(([k, v]) => `${v} rows with ${k}`)
                  .join(', ') || 'none'}
                . Agents reach this data only through Abhed; bulk exports and outside sharing stay blocked.
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">
            <span>
              <b>2 · Behaviour report</b>
            </span>
            {rep && (
              <span>
                {rep.finished}/{rep.tasks} done · batch {batch}
              </span>
            )}
          </div>
          {past.length > 0 && (
            <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Earlier runs:
              </span>
              {past.slice(0, 6).map((b) => (
                <button
                  key={b.batch}
                  className={`pill${b.batch === batch ? ' on' : ''}`}
                  onClick={() => {
                    setBatch(b.batch);
                    void poll(b.batch, b.tasks);
                  }}
                >
                  {b.batch} · {b.tasks}
                </button>
              ))}
            </div>
          )}
          {!rep ? (
            <div className="muted">Upload a requests file and run it. This fills in live as the agents work.</div>
          ) : (
            <>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <Donut label="actions" slices={[{ label: 'on its own', value: rep.allowed, color: 'var(--allow)' }, { label: 'asked a person', value: rep.held, color: 'var(--human)' }, { label: 'refused', value: rep.blocked, color: 'var(--block)' }]} />
                <Donut label="refused" slices={Object.entries(rep.categories).map(([k, v], i) => ({ label: k, value: v, color: PALETTE[i % PALETTE.length] }))} />
              </div>
              <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 12 }}>
                {[
                  ['Approvals asked', rep.held, 'agent stopped and waited', 'var(--human)'],
                  ['Leaks blocked', rep.breachesBlocked, 'exports, outside sharing', 'var(--block)'],
                  ['Agents paused', rep.paused, `${rep.injections} injected requests`, 'var(--block)'],
                  ['Hallucinations caught', rep.categories.hallucination ?? 0, 'wrong amount / id / drug', undefined],
                  ['Gateway p95', rep.p95ms === null ? '—' : `${rep.p95ms} ms`, 'per decision', undefined],
                  ['LLM cost', `₹${rep.costInr}`, `${rep.tokens.toLocaleString('en-IN')} tokens`, undefined],
                ].map(([l, v, n, c]) => (
                  <div className="kpi" key={String(l)}>
                    <div className="kpi-label">{l}</div>
                    <div className="kpi-value" style={{ color: c as string | undefined, fontSize: 22 }}>
                      {v}
                    </div>
                    <div className="kpi-note">{n}</div>
                  </div>
                ))}
              </div>
              <a className="btn btn-ghost btn-sm" href="/api/audit?by=Lab%20reviewer" download>
                ⤓ Full audit report (PDF)
              </a>
            </>
          )}
        </div>
      </div>

      {rep && (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <div className="panel-title">
            <span>
              <b>Every request, step by step</b>
            </span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Agent</th>
                <th>Request</th>
                <th>What happened</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rep.rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td>{r.agent}</td>
                  <td style={{ maxWidth: 300 }}>
                    {r.command.replace(/<!--[\s\S]*-->/, '⟨hidden instruction⟩').slice(0, 150)}
                    {r.answer && (
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        💬 {r.answer.slice(0, 180)}
                      </div>
                    )}
                  </td>
                  <td>
                    {r.steps
                      .filter((s) => s.kind === 'action' || s.kind === 'result' || s.kind === 'security')
                      .map((s, j) =>
                        s.kind === 'security' ? (
                          <div key={j} style={{ color: 'var(--warn)', fontSize: 11.5 }}>
                            🛡 {s.text?.slice(0, 100)}
                          </div>
                        ) : (
                          <div key={j} style={{ fontSize: 12, marginBottom: 3 }}>
                            <span className="mono">{s.action}</span> {s.decision && <Chip d={s.decision} />}
                            {s.decision && s.decision !== 'ALLOWED' && (s.reason || s.text) && (
                              <div className="muted" style={{ fontSize: 11 }}>
                                {(s.reason ?? s.text ?? '').slice(0, 130)}
                              </div>
                            )}
                          </div>
                        ),
                      )}
                  </td>
                  <td>
                    <span className={`chip chip-${r.status === 'done' ? 'allow' : r.status === 'waiting' ? 'human' : r.status === 'running' ? 'info' : 'block'}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
