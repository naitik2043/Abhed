'use client';

import { useEffect, useState } from 'react';
import { Chip, Qr, hhmm, useWorld } from './app';

const ago = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}s ago` : `${Math.round(ms / 60_000)}m ago`);

/** Every agent process that is actually running right now, from its own heartbeats. */
export function LiveFloor() {
  const { view, run, busy } = useWorld();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!view) return null;
  const rts = view.live?.runtimes ?? {};
  const online = Object.values(rts).filter((r) => now - r.lastSeen < 25_000).length;
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-title">
        <span>
          <b>Live floor</b> · agent processes running right now, from their own heartbeats
        </span>
        <span className="row" style={{ gap: 8 }}>
          <span className={`chip chip-${online ? 'allow' : 'muted'}`}>
            {online}/{view.agents.length} online
          </span>
          <span className={`chip chip-${view.llm ? 'allow' : 'muted'}`}>{view.llm ? 'LLM: live' : 'LLM: offline planner'}</span>
        </span>
      </div>
      {online === 0 && (
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
          No agent process is connected. Start them on any machine: <span className="mono" style={{ color: 'var(--ink)' }}>npm run agents -- --url {typeof window !== 'undefined' ? window.location.origin : ''}</span>
        </div>
      )}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10 }}>
        {view.agents.map((a) => {
          const r = rts[a.id];
          const live = r && now - r.lastSeen < 25_000;
          const paused = a.status === 'PAUSED';
          return (
            <div
              key={a.id}
              className={`panel ${paused ? 'shield-close' : ''}`}
              style={{
                padding: 12,
                borderColor: paused ? 'color-mix(in srgb, var(--block) 60%, transparent)' : live ? 'color-mix(in srgb, var(--allow) 40%, transparent)' : undefined,
                minHeight: 196,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div className="row between">
                <span className="row" style={{ gap: 8 }}>
                  <span
                    className="live-dot"
                    style={!live || paused ? { background: paused ? 'var(--block)' : 'var(--muted-2)', boxShadow: 'none', animation: 'none' } : undefined}
                  />
                  <b style={{ fontSize: 15, fontWeight: 500 }}>{a.name}</b>
                  <span className="dim" style={{ fontSize: 11 }}>
                    {a.purpose.split(' ')[0].toLowerCase()}
                  </span>
                </span>
                <Chip d={a.status} />
              </div>
              <div className="mono dim" style={{ fontSize: 10.5 }}>
                {r ? `${live ? 'live' : 'last seen'} ${ago(now - r.lastSeen)} · pid ${r.pid} · ${r.host}` : 'not connected'}
              </div>
              <div style={{ fontSize: 12.5, minHeight: 34 }}>{paused ? <span style={{ color: 'var(--block)' }}>{a.statusReason}</span> : r?.task ?? <span className="dim">idle</span>}</div>
              {r?.lastThought && !paused && (
                <div className="serif muted" style={{ fontSize: 13.5, lineHeight: 1.3 }}>
                  “{r.lastThought.slice(0, 110)}”
                </div>
              )}
              <div style={{ marginTop: 'auto' }}>
                {r?.lastDecision && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: r.lastDecision.includes('BLOCKED') ? 'var(--block)' : r.lastDecision.includes('NEEDS') ? 'var(--human)' : 'var(--allow)',
                    }}
                  >
                    {r.lastDecision.replace('NEEDS APPROVAL', 'WAITING FOR A PERSON')}
                  </div>
                )}
                <div className="row between dim" style={{ fontSize: 10.5, marginTop: 4 }}>
                  <span>{r ? `${r.calls} calls · ${r.tokensToday.toLocaleString('en-IN')} tok · ₹${r.llmCostToday.toFixed(2)}` : `key ••${a.id.slice(0, 2)}`}</span>
                  {a.status === 'ACTIVE' ? (
                    <button className="btn btn-ghost btn-sm btn-danger" style={{ height: 22, padding: '0 8px', fontSize: 11 }} disabled={!!busy} onClick={() => run('pause', { agentId: a.id, by: a.owner, reason: `Paused by ${a.ownerName} from the live floor` })}>
                      Pause
                    </button>
                  ) : (
                    <button className="btn btn-ghost btn-sm" style={{ height: 22, padding: '0 8px', fontSize: 11 }} disabled={!!busy} onClick={() => run('resume', { agentId: a.id, by: a.owner, reason: 'Reviewed by owner' })}>
                      Resume
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Which human phones are on duty right now. */
export function PhonesPanel() {
  const { view } = useWorld();
  const [origin, setOrigin] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setOrigin(window.location.origin);
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);
  if (!view) return null;
  const phones = Object.values(view.live?.approvers ?? {}).filter((a) => now - a.lastSeen < 45_000);
  return (
    <div className="panel">
      <div className="panel-title">
        <span>
          <b>Human phones</b> · approvers on duty
        </span>
        <span className={`chip chip-${phones.length ? 'human' : 'muted'}`}>{phones.length} connected</span>
      </div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div style={{ width: 120, flex: 'none' }}>
          <Qr url={`${origin}/approver`} />
          <div className="dim" style={{ fontSize: 10.5, marginTop: 4, textAlign: 'center' }}>scan → go on duty</div>
        </div>
        <div className="stack" style={{ gap: 6, fontSize: 12.5, minWidth: 0 }}>
          {phones.length === 0 && <div className="muted">Scan once. From then on, every high-risk agent action lands on that phone{view.push ? ' as a push notification' : ''}.</div>}
          {phones.map((p) => (
            <div key={p.name} className="row" style={{ gap: 8 }}>
              <span className="live-dot" style={{ background: 'var(--human)', boxShadow: '0 0 10px var(--human)' }} />
              <span style={{ fontWeight: 500 }}>{p.name}</span>
              <span className="dim">
                {p.device} · {p.push ? 'push on' : 'page open'} · {ago(now - p.lastSeen)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="hr" />
      <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div style={{ width: 120, flex: 'none' }}>
          <Qr url={`${origin}/support`} />
          <div className="dim" style={{ fontSize: 10.5, marginTop: 4, textAlign: 'center' }}>scan → be a customer</div>
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          Judges can message NovaBank like a customer. Abhed routes the message, a live agent picks it up, and anything risky comes back to a human phone.
          <div style={{ marginTop: 6 }}>
            Inbox today: <b style={{ color: 'var(--ink)' }}>{view.live?.inboxCount ?? 0}</b> messages
          </div>
        </div>
      </div>
    </div>
  );
}

/** The unfiltered stream: customer messages, agent thoughts, gateway decisions, phones connecting. */
export function LiveWire() {
  const { view } = useWorld();
  if (!view) return null;
  const ev = view.live?.events ?? [];
  const color = (t: string) => (t === 'allow' ? 'var(--allow)' : t === 'human' ? 'var(--human)' : t === 'block' ? 'var(--block)' : undefined);
  return (
    <div className="panel">
      <div className="panel-title">
        <span>
          <b>Live wire</b> · messages, thoughts, decisions as they happen
        </span>
        <span className="mono">{ev.length}</span>
      </div>
      <div className="feed" style={{ maxHeight: 380 }}>
        {ev.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Quiet. Start the agents or send a customer message.</div>}
        {ev.slice(0, 40).map((e, i) => (
          <div key={`${e.at}-${i}`} className="row" style={{ alignItems: 'flex-start', fontSize: 12.5, padding: '5px 2px', borderBottom: '1px solid var(--border-soft)', animation: 'slidein .4s both' }}>
            <span className="mono dim" style={{ width: 58, flex: 'none' }}>{hhmm(e.at)}</span>
            <span className={e.kind === 'thought' ? 'serif' : undefined} style={{ color: color(e.tone), fontSize: e.kind === 'thought' ? 14 : undefined }}>
              {e.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
