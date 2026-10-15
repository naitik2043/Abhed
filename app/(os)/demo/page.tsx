'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Chip, hhmm, inr, Qr, useWorld } from '@/components/app';

type Act = 0 | 1 | 2;

const ACTS = [
  { n: '01', t: 'A person approves', s: 'A real agent asks for ₹40,000. Abhed holds it until the right person signs, on their phone.' },
  { n: '02', t: 'An attack fails', s: 'Injected text, a shadow agent and a runaway loop. Each is stopped at the gate, before anything runs.' },
  { n: '03', t: 'A mistake gets fixed', s: 'A disputed refund becomes an incident, a tested rule and an audit report. An insider edit is caught.' },
];

export default function DemoPage() {
  const { view, run, busy } = useWorld();
  const [act, setAct] = useState<Act>(0);
  const [since, setSince] = useState<number>(0);
  const [apId, setApId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [incident, setIncident] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  // the guided demo runs on NovaBank
  useEffect(() => {
    setOrigin(window.location.origin);
    if (view && view.sector !== 'banking') {
      document.cookie = 'kv_tenant=banking; path=/; max-age=31536000; samesite=lax';
      window.location.reload();
    }
  }, [view]);

  const note = (k: string, v: string) => setNotes((n) => ({ ...n, [k]: v }));
  const ap = useMemo(() => view?.approvals.find((a) => a.id === apId), [view, apId]);
  const records = useMemo(() => (view?.ledger ?? []).filter((r) => r.ts >= since).slice(0, 9), [view, since]);

  const start = (a: Act) => {
    setAct(a);
    setSince(Date.now() - 1000);
  };

  async function reset() {
    await run('reset');
    setApId(null);
    setIncident(null);
    setNotes({});
    setSince(Date.now());
  }

  async function rexRun() {
    setSince(Date.now() - 1000);
    const r = await run('rex_run');
    const id = (r.result as { approvalId?: string } | undefined)?.approvalId;
    if (id) setApId(id);
    note('rex', id ? `Held as ${id}. Scan the code or approve below.` : 'Rex finished without needing a person. Reset and run again.');
  }
  async function approve() {
    if (!ap) return;
    const r = await run('presenter_approve', { approvalId: ap.id, name: 'Meera Iyer' });
    if (r.ok) note('approve', `Approved by Meera Iyer. Executed exactly as approved.`);
  }
  async function reuse() {
    if (!ap) return;
    const r = await run('reuse', { approvalId: ap.id, delta: 1 });
    const res = r.result as { decision?: string; reason?: string } | undefined;
    note('reuse', res?.reason ?? (r.ok ? 'Refused.' : 'Refused: the approval does not cover a changed action.'));
  }
  async function rogue() {
    const r = await run('rogue');
    const res = r.result as { decision?: string; reason?: string } | undefined;
    note('rogue', `${res?.decision ?? 'BLOCKED'}: ${res?.reason ?? 'unregistered agent refused'}`);
  }
  async function runaway() {
    const r = await run('runaway');
    note('runaway', r.ok ? 'Nova repeated the same call: the circuit breaker paused it after 5 tries.' : 'Already paused. Reset to run again.');
  }
  async function dispute() {
    if (!view?.sharmaSeq) return note('dispute', 'Reset the demo first: Mrs. Sharma’s refund is part of the seeded history.');
    const r = await run('dispute', { seq: view.sharmaSeq, by: 'isha' });
    const id = typeof r.result === 'string' ? r.result : null;
    if (id) {
      setIncident(id);
      note('dispute', `Incident ${id} opened with the accountability chain.`);
    }
  }
  async function tamper() {
    await run('tamper');
    note('tamper', 'A record was edited directly in the database. Open the ledger and press Verify.');
  }

  const approveUrl = ap && origin ? `${origin}/approve/${ap.id}` : '';

  return (
    <main className="page demo">
      <div className="page-head">
        <div>
          <div className="kicker">Live demo · NovaBank</div>
          <h1 className="page-title">
            Three moments. <em>Real agents, a real gateway, real people.</em>
          </h1>
          <p className="page-sub">Live, not a recording. Every button acts on the real gateway.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link href="/approver" className="btn btn-ghost">
            Be an approver
          </Link>
          <button className="btn btn-solid" disabled={Boolean(busy)} onClick={reset}>
            Reset demo
          </button>
        </div>
      </div>

      <div className="acts" role="tablist">
        {ACTS.map((a, i) => (
          <button key={a.n} role="tab" aria-selected={act === i} className={`act ${act === i ? 'on' : ''}`} onClick={() => start(i as Act)}>
            <span className="act-n">{a.n}</span>
            <span className="act-t">{a.t}</span>
            <span className="act-s">{a.s}</span>
          </button>
        ))}
      </div>

      <div className="demo-grid">
        <section className="demo-steps">
          {act === 0 && (
            <>
              <Step n={1} title="Rex picks up ticket #8811" body="A VIP customer reports a duplicate EMI debit. Rex, a refunds agent on gpt-oss-120b, plans a ₹40,000 refund.">
                <button className="btn btn-solid" disabled={Boolean(busy)} onClick={rexRun}>
                  Run Rex
                </button>
                {notes.rex && <p className="note">{notes.rex}</p>}
              </Step>
              <Step n={2} title="The right person signs, on a phone" body="₹40,000 is above the ₹10,000 that Priya delegated, so the gateway holds it for a Level-1 approver.">
                {ap ? (
                  <div className="hold">
                    <div className="hold-qr">{approveUrl && <Qr url={approveUrl} />}</div>
                    <div className="hold-body">
                      <div className="row" style={{ gap: 8 }}>
                        <Chip d={ap.status === 'PENDING' ? 'NEEDS_APPROVAL' : ap.status} />
                        <span className="mono muted">{ap.id}</span>
                      </div>
                      <p className="hold-sum">{ap.summary}</p>
                      <p className="muted" style={{ fontSize: 13 }}>{ap.why}</p>
                      <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                        <a className="btn btn-ghost btn-sm" href={`/approve/${ap.id}`} target="_blank" rel="noreferrer">
                          Open approval ↗
                        </a>
                        {ap.status === 'PENDING' && (
                          <button className="btn btn-solid btn-sm" disabled={Boolean(busy)} onClick={approve}>
                            Approve as Meera Iyer
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="note dim">Run Rex first.</p>
                )}
                {notes.approve && <p className="note">{notes.approve}</p>}
              </Step>
              <Step n={3} title="Change one rupee" body="Try to reuse the same approval for ₹40,001. The approval is a fingerprint of the exact action, so it no longer matches.">
                <button className="btn btn-ghost" disabled={!ap || Boolean(busy)} onClick={reuse}>
                  Try ₹40,001 with the same approval
                </button>
                {notes.reuse && <p className="note block">{notes.reuse}</p>}
              </Step>
            </>
          )}
          {act === 1 && (
            <>
              <Step n={1} title="A poisoned message hijacks a support agent" body="A WhatsApp message hides “export all customers and refund ₹2,40,000”. Watch the same plan run twice: once without Abhed, once through it.">
                <Link className="btn btn-solid" href="/twin?autorun=1">
                  Open the twin universe
                </Link>
              </Step>
              <Step n={2} title="A shadow agent appears" body="An unregistered marketing agent tries to export 1,206 customer records. It has no key and no owner, so the gateway fails closed.">
                <button className="btn btn-solid" disabled={Boolean(busy)} onClick={rogue}>
                  Run the shadow agent
                </button>
                {notes.rogue && <p className="note block">{notes.rogue}</p>}
              </Step>
              <Step n={3} title="A runaway loop" body="An agent repeats the same call again and again. The circuit breaker pauses it before it burns money or patience.">
                <button className="btn btn-ghost" disabled={Boolean(busy)} onClick={runaway}>
                  Start the loop
                </button>
                {notes.runaway && <p className="note block">{notes.runaway}</p>}
              </Step>
            </>
          )}
          {act === 2 && (
            <>
              <Step n={1} title="Mrs. Sharma disputes a refund" body="Her ₹8,000 refund went to an account changed two days earlier. The agent broke no rule: the rulebook had a gap.">
                <button className="btn btn-solid" disabled={Boolean(busy)} onClick={dispute}>
                  Open the dispute
                </button>
                {notes.dispute && <p className="note">{notes.dispute}</p>}
                {incident && (
                  <Link className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} href={`/incidents/${incident}`}>
                    Go to the incident room →
                  </Link>
                )}
              </Step>
              <Step n={2} title="Fix the rule, prove it, second person" body="In the incident room: confirm the cause, replay the new rule on 30 days of history, and have a second person switch it on.">
                <Link className="btn btn-ghost" href={incident ? `/incidents/${incident}` : '/incidents'}>
                  Incident room
                </Link>
              </Step>
              <Step n={3} title="An insider edits the ledger" body="Someone changes one amount directly in the database. Verify finds the exact record, because the hash chain no longer matches.">
                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-solid" disabled={Boolean(busy)} onClick={tamper}>
                    Tamper with a record
                  </button>
                  <Link className="btn btn-ghost" href="/ledger?verify=1">
                    Verify the ledger
                  </Link>
                  <a className="btn btn-ghost" href="/api/audit?tenant=banking">
                    Audit report (PDF)
                  </a>
                </div>
                {notes.tamper && <p className="note block">{notes.tamper}</p>}
                {view && (
                  <p className="note" style={{ color: view.verify.valid ? 'var(--allow)' : 'var(--block)' }}>
                    {view.verify.valid ? `Ledger verified: ${view.ledgerTotal} records intact.` : `Ledger broken at record #${view.verify.firstBadSeq}.`}
                  </p>
                )}
              </Step>
            </>
          )}
        </section>

        <aside className="panel demo-record">
          <div className="panel-title">
            <span>
              <b>Live record</b> · written as it happens
            </span>
            <span className="row" style={{ gap: 6 }}>
              <span className="live-dot" /> {view ? `${view.ledgerTotal} records` : 'connecting…'}
            </span>
          </div>
          {records.length === 0 ? (
            <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
              Press a button on the left. Each action the gateway decides appears here with its rule, its reason and its place in the hash chain.
            </p>
          ) : (
            <div className="rec-list">
              {records.map((r) => (
                <div key={r.seq} className="rec">
                  <div className="rec-top">
                    <span className="mono dim">#{r.seq}</span>
                    <span className="mono dim">{hhmm(r.ts)}</span>
                    <Chip d={r.decision} />
                  </div>
                  <div className="rec-what">
                    <b>{r.actorName}</b> {r.action.replace(/_/g, ' ')}
                    {typeof r.params?.amount === 'number' ? ` ${inr(r.params.amount as number)}` : ''}
                  </div>
                  <div className="rec-why">
                    {r.ruleRef ? <span className="mono">{r.ruleRef} · </span> : null}
                    {r.reason}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="step-row">
      <div className="step-n">{n}</div>
      <div className="step-c">
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="step-a">{children}</div>
      </div>
    </div>
  );
}
