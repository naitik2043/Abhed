'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Chip, hhmm, inr, useWorld } from '@/components/app';

function LedgerInner() {
  const { view, run, busy, toast } = useWorld();
  const params = useSearchParams();
  const [check, setCheck] = useState<{ valid: boolean; first_bad_seq: number | null; checked: number } | null>(null);
  const [filter, setFilter] = useState('');
  const fired = useRef(false);

  const verify = async () => {
    const r = await fetch('/api/ledger/verify', { cache: 'no-store' });
    const d = await r.json();
    setCheck(d);
    toast(d.valid ? `Verified ${d.checked} records: chain intact.` : `Chain broken at record #${d.first_bad_seq}: someone edited history.`, d.valid ? 'allow' : 'block');
    if (!d.valid) setTimeout(() => document.getElementById(`rec-${d.first_bad_seq}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
  };

  useEffect(() => {
    if (params.get('verify') === '1' && !fired.current && view) {
      fired.current = true;
      setTimeout(verify, 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, view]);

  if (!view) return <main className="page muted">Loading…</main>;
  const bad = check && !check.valid ? check.first_bad_seq : null;
  const rows = view.ledger.filter((r) => !filter || JSON.stringify(r).toLowerCase().includes(filter.toLowerCase()));
  // make sure the tampered row is visible even if older than the window
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            The <em>Ledger</em>
          </h1>
          <p className="page-sub">
            Every action by people and agents. Append-only and hash-chained.
          </p>
        </div>
        <div className="row wrap">
          <input placeholder="Filter: Rex, refund, BLOCKED…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 230 }} />
          <button className="btn btn-solid" onClick={verify}>
            Verify chain
          </button>
          {view.tampered ? (
            <button className="btn btn-ghost" disabled={!!busy} onClick={async () => { await run('restore'); setTimeout(verify, 300); }}>
              Restore record
            </button>
          ) : (
            <button className="btn btn-ghost btn-danger" disabled={!!busy} onClick={() => run('tamper')} title="Simulates an insider editing one row directly in the database">
              Tamper (insider edit)
            </button>
          )}
        </div>
      </div>

      {check && (
        <div className="panel" style={{ marginBottom: 14, borderColor: check.valid ? 'color-mix(in srgb, var(--allow) 55%, transparent)' : 'color-mix(in srgb, var(--block) 70%, transparent)', background: check.valid ? undefined : 'rgba(255,99,99,0.07)' }}>
          <div style={{ fontSize: 20, letterSpacing: '-0.03em' }}>
            {check.valid ? (
              <>
                ✓ {check.checked} records verified. <span className="serif muted">Nobody edited history.</span>
              </>
            ) : (
              <>
                ✕ Chain broken at <span className="mono">#{check.first_bad_seq}</span>. <span className="serif muted">Someone edited history behind our back, and we know exactly where.</span>
              </>
            )}
          </div>
        </div>
      )}

      {bad && !rows.some((r) => r.seq === bad) && (
        <div className="muted" style={{ marginBottom: 10 }}>
          Record #{bad} is older than the last 120 shown; the report cites it.
        </div>
      )}

      <div className="panel" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Actor</th>
              <th>On behalf of</th>
              <th>Action</th>
              <th>Data touched</th>
              <th>Decision</th>
              <th>Rule</th>
              <th>Approved by</th>
              <th>Outcome</th>
              <th>Hash</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const outcome = view.outcomes[r.seq] ?? r.outcome;
              const isBad = bad === r.seq;
              return (
                <tr key={r.seq} id={`rec-${r.seq}`} style={isBad ? { background: 'rgba(255,99,99,0.14)', outline: '1px solid var(--block)' } : r.seq === view.sharmaSeq ? { background: 'rgba(255,181,71,0.05)' } : undefined}>
                  <td className="mono dim">{r.seq}</td>
                  <td className="mono dim">{hhmm(r.ts)}</td>
                  <td>
                    <span style={{ fontWeight: 500 }}>{r.actorName}</span> <span className="dim">{r.actorType}</span>
                  </td>
                  <td className="muted">{r.onBehalfOf ?? '—'}</td>
                  <td style={{ maxWidth: 300 }}>
                    <div>{String(r.meta?.desc ?? r.action.replace(/_/g, ' ')).replace(`${r.actorName} → `, '')}</div>
                    <div className="mono dim" style={{ fontSize: 11 }}>
                      {Object.entries(r.params)
                        .slice(0, 3)
                        .map(([k, v]) => `${k}=${k === 'amount' && typeof v === 'number' ? inr(v) : String(v)}`)
                        .join(' ')}
                    </div>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{r.dataTouched.join(', ') || '—'}</td>
                  <td>
                    <Chip d={r.decision} />
                  </td>
                  <td className="mono dim">{r.ruleRef ?? '—'}</td>
                  <td>{r.approvers.join(' + ') || <span className="dim">—</span>}</td>
                  <td>{outcome !== 'n/a' ? <Chip d={outcome} /> : <span className="dim">—</span>}</td>
                  <td className="mono dim" title={r.hash}>
                    {r.hash.slice(0, 8)}
                  </td>
                  <td>
                    {r.action === 'issue_refund' && outcome === 'pending' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={!!busy}
                        onClick={async () => {
                          const res = await run('dispute', { seq: r.seq, by: 'isha' });
                          if (res.ok) window.location.href = `/incidents/${String(res.result)}`;
                        }}
                      >
                        Dispute
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

export default function LedgerPage() {
  return (
    <Suspense>
      <LedgerInner />
    </Suspense>
  );
}
