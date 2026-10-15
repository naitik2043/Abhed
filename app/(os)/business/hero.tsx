'use client';

import { useState } from 'react';
import { useWorld } from '@/components/app';

const VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260424_064411_9e9d7f84-9277-41f4-ab10-59172d89e6be.mp4';
const POSTER = 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1600&q=60';
const ORANGE = '#ef4d23';
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const I = {
  right: <path d="M9 6l6 6-6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  trendDown: (
    <>
      <path d="M22 17l-8.5-8.5-5 5L2 7" />
      <path d="M16 17h6v-6" />
    </>
  ),
  trendUp: (
    <>
      <path d="M22 7l-8.5 8.5-5-5L2 17" />
      <path d="M16 7h6v6" />
    </>
  ),
  x: <path d="M18 6L6 18M6 6l12 12" />,
};
function Ico({ d, size = 16 }: { d: keyof typeof I; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {I[d]}
    </svg>
  );
}

/** A 180° gauge of 40 ticks; `value` percent of them light up. */
export function Gauge({ value, color = ORANGE, showLabels, min, max }: { value: number; color?: string; showLabels?: boolean; min?: string; max?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const active = Math.round((v / 100) * 40);
  const r = 80;
  return (
    <div className="cv-gauge">
      <svg viewBox="0 0 200 120" role="img" aria-label={`${Math.round(v)}%`}>
        {Array.from({ length: 40 }, (_, i) => {
          const a = Math.PI + (i / 39) * Math.PI;
          const c = Math.cos(a);
          const s = Math.sin(a);
          return <line key={i} x1={100 + c * (r - 10)} y1={100 + s * (r - 10)} x2={100 + c * r} y2={100 + s * r} stroke={i < active ? color : '#d4d4d8'} strokeWidth={2.5} strokeLinecap="round" />;
        })}
        <text x={100} y={105} textAnchor="middle" fontSize={22} fontWeight={600} fill="#0b0f1a">
          {Math.round(v)}%
        </text>
      </svg>
      {showLabels && (
        <div className="cv-gauge-l">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      )}
    </div>
  );
}

function Toggle<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="cv-toggle" role="tablist">
      {options.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

type Props = {
  actions: number;
  setActions: (n: number) => void;
  high: number;
  setHigh: (n: number) => void;
  bill: number;
  agentFee: number;
  onReset: () => void;
};

/** Pricing opens on a video hero; the tray below it is live: today's governance, and a bill you can change. */
export function PricingHero({ actions, setActions, high, setHigh, bill, agentFee, onReset }: Props) {
  const { view } = useWorld();
  const [g1, setG1] = useState<'actions' | 'agents'>('actions');
  const [g3, setG3] = useState<'month' | 'year'>('month');
  const [period, setPeriod] = useState('This month');
  const k = view?.kpi;
  const total = k?.actionsToday ?? 0;
  const refused = view ? view.ledger.filter((r) => r.decision === 'BLOCKED' && Date.now() - r.ts < 86_400_000).length : 0;
  const agents = view?.agents ?? [];
  const activeAgents = agents.filter((a) => a.status === 'ACTIVE').length;
  const g1v = g1 === 'actions' ? (k?.autoPct ?? 0) : agents.length ? (activeAgents / agents.length) * 100 : 0;
  const mult = g3 === 'year' ? 12 : 1;
  const shown = bill * mult;
  const agentShare = bill > 0 ? (agentFee / bill) * 100 : 0;
  const go = () => document.getElementById('calc')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <section className="cv">
      <div className="cv-hero">
        <video className="cv-video" autoPlay loop muted playsInline preload="auto" disableRemotePlayback poster={POSTER} src={VIDEO} {...{ 'webkit-playsinline': 'true', 'x5-playsinline': 'true' }} />
        <div className="cv-veil" />
        <div className="cv-fg">
          <div className="cv-content">
            <span className="cv-badge">
              <i /> Abhed pricing
            </span>
            <h1 className="cv-h1">
              Pricing for the <span className="cv-serif">accountable</span>
              <br />
              AI workforce
            </h1>
            <p className="cv-sub">Pay for the actions you govern and the agents that ran. Checkpoints and phone approvals are never charged.</p>
            <button className="cv-cta" onClick={go}>
              Estimate your bill
              <span>
                <Ico d="right" />
              </span>
            </button>
          </div>
          <div className="cv-tray-wrap">
            <div className="cv-tray">
              <div className="cv-card">
                <div className="cv-card-h">
                  <b>Ran on their own</b>
                  <span>today · {view?.company?.replace(' (fictional)', '') ?? 'live'}</span>
                </div>
                <div className="cv-big">
                  <strong data-live>{total.toLocaleString('en-IN')}</strong>
                  <em className="cv-pill red">
                    <Ico d="trendDown" size={12} /> {refused} refused
                  </em>
                </div>
                <p className="cv-cap">governed actions today</p>
                <p className="cv-mid">{g1 === 'actions' ? 'Handled without a person' : 'Agents active right now'}</p>
                <Gauge value={g1v} showLabels min="0" max={g1 === 'actions' ? `${total.toLocaleString('en-IN')} actions` : `${agents.length} agents`} />
                <Toggle options={[['actions', 'Actions'], ['agents', 'Agents']]} value={g1} onChange={setG1} />
              </div>

              <div className="cv-card cv-form">
                <label className="cv-f">
                  <span>Show figures for</span>
                  <span className="cv-select">
                    <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                      <option>This month</option>
                      <option>Next month</option>
                    </select>
                    <Ico d="down" size={14} />
                  </span>
                </label>
                <label className="cv-f">
                  <span>Compare period by</span>
                  <span className="cv-select">
                    <select defaultValue="mtd">
                      <option value="mtd">Month-to-date (MTD)</option>
                      <option value="ytd">Year-to-date (YTD)</option>
                    </select>
                    <Ico d="down" size={14} />
                  </span>
                </label>
                <label className="cv-f">
                  <span>Governed actions ({period.toLowerCase()})</span>
                  <span className="cv-num">
                    <i>#</i>
                    <input type="number" min={0} step={10000} value={actions} onChange={(e) => setActions(Math.max(0, Number(e.target.value) || 0))} />
                  </span>
                </label>
                <label className="cv-f">
                  <span>High-risk agents</span>
                  <span className="cv-num">
                    <i>#</i>
                    <input type="number" min={0} value={high} onChange={(e) => setHigh(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
                  </span>
                </label>
                <div className="cv-form-f">
                  <button className="cv-save" onClick={go}>
                    Full bill
                  </button>
                  <button className="cv-link" onClick={onReset}>
                    Reset
                  </button>
                  <button
                    className="cv-x"
                    aria-label="Clear to the free tier"
                    title="Clear to the free tier"
                    onClick={() => {
                      setActions(0);
                      setHigh(0);
                    }}
                  >
                    <Ico d="x" />
                  </button>
                </div>
              </div>

              <div className="cv-card">
                <div className="cv-card-h">
                  <b>Your bill</b>
                  <span>{g3 === 'year' ? 'a year' : 'a month'}</span>
                </div>
                <div className="cv-big">
                  <strong data-live>{inr(shown)}</strong>
                  <em className="cv-pill">
                    <Ico d="trendUp" size={12} /> {inr(shown / Math.max(1, actions * mult / 1000))}/1k
                  </em>
                </div>
                <p className="cv-cap">checkpoints and approvals never charged</p>
                <p className="cv-mid">Share of the bill from agents</p>
                <Gauge value={agentShare} color="#9ca3af" />
                <Toggle options={[['month', 'Monthly'], ['year', 'Yearly']]} value={g3} onChange={setG3} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
