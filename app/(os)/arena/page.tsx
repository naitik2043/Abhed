'use client';

import { useEffect, useRef, useState } from 'react';
import { inr, Qr } from '@/components/app';

type Step = { action: string; decision: string; check: string; reason: string; rule?: string; ms?: number; amount?: number; records?: number; paused?: boolean; seq?: number };
type Lane = { status: string; model?: string; answer?: string; injection?: string[]; steps: Step[] };
type Attack = {
  id: string; at: number; name: string; agentId: string; text: string; company: string;
  model?: Lane; twin?: Lane; stopped: number; held: number; through: string[]; inPolicy?: { action: string; amount?: number; rule?: string }[]; rupees: number; records: number; done: boolean;
};
type Tick = { company: string; seq: number; ts: number; actor: string; action: string; decision: string; rule?: string; reason: string; check: string; ms?: number; amount?: number; hash?: string };
type Feed = {
  attacks: Attack[];
  ticker: Tick[];
  stats: { attacks: number; attackers: number; stopped: number; held: number; through: number; rupees: number; records: number; paused: number; modelRefused: number; medianMs: number | null; checks: Record<string, number>; ledger: number };
};

const CHECKS: [string, string, string][] = [
  ['scanner', 'Scanner', 'injected text'],
  ['identity', 'Identity', 'key · owner · paused'],
  ['scope', 'Scope', 'only this customer'],
  ['delegation', 'Delegation', 'who allowed it'],
  ['grounding', 'Grounding', 'matches real records'],
  ['dataloss', 'Data loss', 'PAN · Aadhaar · bulk'],
  ['rules', 'Rules', 'company rulebook'],
  ['person', 'A person', 'big actions wait'],
];
const AGENT: Record<string, string> = { rex: 'Rex', claimy: 'Claimy', shoppy: 'Shoppy' };
const VERB: Record<string, string> = { BLOCKED: 'Stopped', NEEDS_APPROVAL: 'Held for a person', ALLOWED: 'Allowed', EXECUTED: 'Executed', PAUSED: 'Agent paused', INFO: 'Logged', FLAG: 'Flagged' };
const tone = (d: string) => (d === 'BLOCKED' || d === 'PAUSED' ? 'block' : d === 'NEEDS_APPROVAL' ? 'human' : d === 'INFO' || d === 'FLAG' ? 'muted' : 'allow');
const hhmmss = (ts: number) => new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const what = (s: Step) => `${s.action.replace(/_/g, ' ')}${s.amount ? ` ${inr(s.amount)}` : ''}${s.records ? ` · ${s.records.toLocaleString('en-IN')} records` : ''}`;
const CHECK_NAME = Object.fromEntries(CHECKS.map(([k, n]) => [k, n]));

export default function WarRoom() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [origin, setOrigin] = useState('');
  const [flash, setFlash] = useState<string[]>([]);
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    const full = new URLSearchParams(window.location.search).get('full') === '1';
    if (full) document.body.classList.add('wr-full');
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/arena', { cache: 'no-store' });
        const j = (await r.json()) as Feed;
        if (!alive) return;
        setFeed(j);
        const top = j.attacks[0];
        if (top && top.done && top.id !== lastId.current) {
          if (lastId.current !== null) {
            const hit = [...(top.twin?.steps ?? []), ...(top.model?.steps ?? [])].map((s) => s.check);
            if (top.twin?.injection?.length) hit.push('scanner');
            setFlash(hit);
            setTimeout(() => setFlash([]), 2600);
          }
          lastId.current = top.id;
        } else if (!top && lastId.current === null) lastId.current = '';
      } catch {
        /* keep the last frame */
      }
      if (alive) setTimeout(tick, 1500);
    };
    tick();
    return () => {
      alive = false;
      document.body.classList.remove('wr-full');
    };
  }, []);

  const s = feed?.stats;
  const attackUrl = origin ? `${origin}/attack` : '';

  return (
    <main className="page wr">
      <header className="wr-head">
        <div>
          <div className="kicker">Break Abhed · live</div>
          <h1 className="wr-title">Try to make our agents misbehave.</h1>
          <p className="page-sub">
            Scan the code. Tell any agent to do something it shouldn’t.
          </p>
        </div>
        <div className="wr-qr">
          {attackUrl && <Qr url={attackUrl} />}
          <div>
            <b>Scan to attack</b>
            <span className="mono">{attackUrl.replace(/^https?:\/\//, '')}</span>
          </div>
        </div>
      </header>

      <section className="wr-score">
        <Score v={s ? String(s.attacks) : '…'} l={s ? `attacks from ${s.attackers} ${s.attackers === 1 ? 'person' : 'people'}` : 'attacks'} />
        <Score v={s ? String(s.stopped) : '…'} l="actions stopped at the gate" tone="block" />
        <Score v={s ? String(s.held) : '…'} l="held for a person" tone="human" />
        <Score v={s ? String(s.through) : '…'} l="got through" tone={s && s.through > 0 ? 'block' : 'allow'} big />
        <Score v={s ? inr(s.rupees) : '…'} l="money the attacks tried to move" />
        <Score v={s ? s.records.toLocaleString('en-IN') : '…'} l="records they tried to take" />
        <Score v={s?.medianMs != null ? `${s.medianMs.toFixed(1)} ms` : '…'} l="median time to decide" />
      </section>

      <section className="wr-pipe" aria-label="Abhed's checks">
        {CHECKS.map(([k, n, d], i) => (
          <div key={k} className={`wr-check ${flash.includes(k) ? 'hit' : ''}`}>
            <span className="wr-i">{String(i + 1).padStart(2, '0')}</span>
            <b>{n}</b>
            <span className="wr-d">{d}</span>
            <span className="wr-c">{s ? (k === 'scanner' ? (feed?.attacks.filter((a) => a.twin?.injection?.length).length ?? 0) : (s.checks[k] ?? 0)) : '…'}</span>
          </div>
        ))}
      </section>

      <div className="wr-main">
        <section className="wr-feed">
          {feed && feed.attacks.length === 0 && (
            <div className="wr-empty">
              <b>Waiting for the first attack.</b>
              <p>Scan the code on the right. Your name and your message appear here, with the check that stopped it.</p>
            </div>
          )}
          {feed?.attacks.map((a) => (
            <article key={a.id} className={`wr-card ${a.done ? '' : 'live'}`}>
              <div className="wr-card-top">
                <span className="wr-who">
                  <b>{a.name}</b> attacked <b>{AGENT[a.agentId]}</b> at {a.company}
                </span>
                <span className="mono dim">{hhmmss(a.at)}</span>
              </div>
              <blockquote>“{a.text}”</blockquote>
              <div className="wr-lanes">
                <LaneView title="The real agent" sub={a.model?.model ?? 'gpt-oss-120b'} lane={a.model} modelLane />
                <LaneView title="If the model were fooled" sub="a twin that obeys the message literally" lane={a.twin} />
              </div>
              {a.done && (
                <div className={`wr-verdict ${a.through.length ? 'bad' : 'good'}`}>
                  {a.through.length
                    ? `Got through: ${a.through.join(', ').replace(/_/g, ' ')}`
                    : `Nothing got through.${a.rupees ? ` ${inr(a.rupees)} stayed put.` : ''}${a.records ? ` ${a.records.toLocaleString('en-IN')} records stayed inside.` : ''}${[...(a.twin?.steps ?? [])].some((x) => x.paused) ? ` ${AGENT[a.agentId]} was paused automatically.` : ''}${a.inPolicy?.length ? ` Allowed by the company’s own rules: ${a.inPolicy.map((x) => `${x.action.replace(/_/g, ' ')}${x.amount ? ` ${inr(x.amount)}` : ''} (${x.rule})`).join(', ')}.` : ''}`}
                </div>
              )}
            </article>
          ))}
        </section>

        <aside className="wr-ticker panel">
          <div className="panel-title">
            <span>
              <b>Live monitor</b> · every decision
            </span>
            <span className="row" style={{ gap: 6 }}>
              <span className="live-dot" />
              {s ? `${s.ledger.toLocaleString('en-IN')} records` : ''}
            </span>
          </div>
          <div className="wr-ticks">
            {feed?.ticker.map((t) => (
              <div key={`${t.company}-${t.seq}`} className="wr-tick">
                <div className="row between">
                  <span className="dim" style={{ fontSize: 12 }}>
                    {t.company} · #{t.seq}
                  </span>
                  <span className={`chip chip-${tone(t.decision)}`}>{t.decision === 'BLOCKED' ? `Stopped · ${CHECK_NAME[t.check] ?? t.check}` : VERB[t.decision] ?? t.decision}</span>
                </div>
                <div className="wr-tick-what">
                  <b>{t.actor}</b> {t.action.replace(/_/g, ' ')}
                  {t.amount ? ` ${inr(t.amount)}` : ''}
                </div>
                <div className="wr-tick-meta mono">
                  {t.rule ?? '—'} · {t.ms != null ? `${t.ms.toFixed(2)} ms` : '—'} · {t.hash}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
      <footer className="wr-foot">
        <span>Every attempt above is a real call through the Abhed gateway, written to the hash-chained ledger. Companies are fictional.</span>
        <button
          className="wr-clear"
          onClick={async () => {
            const pin = window.prompt('Presenter PIN to clear the War Room');
            if (!pin) return;
            const r = await fetch('/api/arena', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
            if (!r.ok) window.alert('Wrong PIN');
          }}
        >
          clear
        </button>
      </footer>
    </main>
  );
}

function Score({ v, l, tone, big }: { v: string; l: string; tone?: string; big?: boolean }) {
  return (
    <div className={`wr-s ${big ? 'big' : ''} ${tone ? `t-${tone}` : ''}`}>
      <div className="wr-v">{v}</div>
      <div className="wr-l">{l}</div>
    </div>
  );
}

function LaneView({ title, sub, lane, modelLane }: { title: string; sub: string; lane?: Lane; modelLane?: boolean }) {
  const risky = (lane?.steps ?? []).filter((s) => !['read_ticket', 'read_customer', 'read_patient', 'lookup_order', 'lookup_transaction', 'search_policy', 'lookup_product'].includes(s.action));
  return (
    <div className="wr-lane">
      <div className="wr-lane-h">
        <b>{title}</b>
        <span>{sub}</span>
      </div>
      {!lane && <p className="dim">Model offline: only the twin ran.</p>}
      {lane && lane.injection && lane.injection.length > 0 && !modelLane && <div className="wr-step scan">Scanner flagged: {lane.injection.join(', ')}</div>}
      {lane && lane.status === 'running' && risky.length === 0 && (
        <div className="wr-step wait">
          <span className="thinking">
            <i />
            <i />
            <i />
          </span>{' '}
          thinking…
        </div>
      )}
      {lane && modelLane && lane.status !== 'running' && risky.length === 0 && <div className="wr-step good">Refused on its own: “{(lane.answer ?? 'I can’t help with that.').slice(0, 140)}”</div>}
      {risky.map((s, i) => (
        <div key={i} className={`wr-step ${tone(s.decision)}`}>
          <div className="row between">
            <b>{what(s)}</b>
            <span className={`chip chip-${tone(s.decision)}`}>{s.decision === 'BLOCKED' ? `Stopped · ${CHECK_NAME[s.check] ?? s.check}` : s.decision === 'ALLOWED' && /^(REFUND-AUTO|DISCOUNT-OK)/.test(s.rule ?? '') ? 'Allowed · within policy' : VERB[s.decision] ?? s.decision}</span>
          </div>
          <div className="wr-why">
            {s.reason}
            {s.rule ? <span className="mono"> · {s.rule}</span> : null}
            {s.ms != null ? <span className="mono"> · {s.ms.toFixed(2)} ms</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
