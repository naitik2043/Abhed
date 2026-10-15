'use client';

import Link from 'next/link';
import { ago, inr, useWorld } from '@/components/app';

export default function IncidentsPage() {
  const { view, run, busy } = useWorld();
  const router = typeof window !== 'undefined' ? null : null;
  void router;
  if (!view) return <main className="page muted">Loading…</main>;
  const sharma = view.ledger.find((r) => r.seq === view.sharmaSeq);
  const disputed = view.sharmaSeq ? view.outcomes[view.sharmaSeq] === 'disputed' : false;
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">
            Incident <em>Room</em>
          </h1>
          <p className="page-sub">Attacks and wrong-but-allowed outputs. Every incident gets an accountability chain, a named owner, a fix and proof the fix works.</p>
        </div>
      </div>

      {!disputed && view.sharmaSeq && (
        <div className="panel waiting" style={{ marginBottom: 14 }}>
          <div className="panel-title">
            <span style={{ color: 'var(--human)' }}>● Customer complaint · ticket #7741 · WhatsApp</span>
            <span className="mono">record #{view.sharmaSeq}</span>
          </div>
          <div style={{ fontSize: 22, letterSpacing: '-0.03em' }}>
            Mrs. Sunita Sharma: <span className="serif muted">“my ₹8,000 refund never reached me.”</span>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Rex refunded {inr(Number(sharma?.meta?.amount ?? 8000))} yesterday under {sharma?.ruleRef ?? 'REFUND-AUTO@3'}. The AI followed every rule. So who is accountable?
          </div>
          <button
            className="btn btn-solid"
            style={{ marginTop: 14 }}
            disabled={!!busy}
            onClick={async () => {
              const r = await run('dispute', { seq: view.sharmaSeq, by: 'isha' });
              if (r.ok) window.location.href = `/incidents/${String(r.result)}`;
            }}
          >
            Mark refund as disputed
          </button>
        </div>
      )}

      <div className="panel">
        <div className="panel-title">
          <span>
            <b>Incidents</b>
          </span>
          <span>{view.incidents.length}</span>
        </div>
        {view.incidents.length === 0 && <div className="muted">No incidents yet.</div>}
        <table className="table">
          <tbody>
            {view.incidents.map((i) => (
              <tr key={i.id} className="clickable">
                <td className="mono" style={{ width: 90 }}>
                  <Link href={`/incidents/${i.id}`}>{i.id}</Link>
                </td>
                <td>
                  <Link href={`/incidents/${i.id}`}>{i.title}</Link>
                </td>
                <td>
                  <span className={`chip chip-${i.type === 'INCORRECT_OUTPUT' ? 'warn' : 'block'}`}>{i.type.replace('_', ' ')}</span>
                </td>
                <td className="muted">owner {view.humans.find((h) => h.id === i.ownerId)?.name}</td>
                <td>
                  <span className={`chip chip-${i.status === 'RESOLVED' ? 'allow' : 'human'}`}>{i.status.replace(/_/g, ' ')}</span>
                </td>
                <td className="muted r">{ago(i.openedAt, view.now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
