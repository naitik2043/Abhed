'use client';

export function SpeedChart({ points }: { points: { t: number; auto: number; held: number; blocked: number; p95: number }[] }) {
  const W = 520,
    H = 150,
    pad = 22;
  const max = Math.max(1, ...points.map((p) => p.auto + p.held + p.blocked));
  const maxMs = Math.max(1, ...points.map((p) => p.p95));
  const bw = (W - pad * 2) / Math.max(1, points.length);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const ym = (v: number) => H - pad - (v / maxMs) * (H - pad * 2);
  const line = points.map((p, i) => (p.p95 ? `${pad + i * bw + bw / 2},${ym(p.p95)}` : null)).filter(Boolean).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Agent actions over time by outcome, with gateway latency">
      {points.map((p, i) => {
        const x = pad + i * bw + 1;
        const a = y(p.auto),
          h = y(p.auto + p.held),
          b = y(p.auto + p.held + p.blocked);
        return (
          <g key={i}>
            <rect x={x} y={a} width={bw - 2} height={H - pad - a} fill="var(--allow)" opacity={0.85} />
            <rect x={x} y={h} width={bw - 2} height={a - h} fill="var(--human)" />
            <rect x={x} y={b} width={bw - 2} height={h - b} fill="var(--block)" />
          </g>
        );
      })}
      {line && <polyline points={line} fill="none" stroke="var(--ink)" strokeWidth={1.4} strokeDasharray="3 3" opacity={0.7} />}
      <text x={pad} y={12} fill="var(--muted)" fontSize={10}>
        {max} actions
      </text>
      <text x={W - pad} y={12} fill="var(--muted)" fontSize={10} textAnchor="end">
        p95 {maxMs.toFixed(1)} ms
      </text>
      <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="var(--border)" />
    </svg>
  );
}

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** Donut with total in the middle and a legend with shares. */
export function Donut({ slices, label, size = 132 }: { slices: Slice[]; label: string; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 52,
    r = 34,
    c = 64;
  let a = -Math.PI / 2;
  const pt = (ang: number, rad: number) => `${(c + rad * Math.cos(ang)).toFixed(2)} ${(c + rad * Math.sin(ang)).toFixed(2)}`;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const b = a + (2 * Math.PI * s.value) / Math.max(1, total);
      const large = b - a > Math.PI ? 1 : 0;
      const d = s.value === total ? null : `M${pt(a, R)} A${R} ${R} 0 ${large} 1 ${pt(b, R)} L${pt(b, r)} A${r} ${r} 0 ${large} 0 ${pt(a, r)}Z`;
      a = b;
      return { s, d };
    });
  return (
    <div className="row" style={{ gap: 14, alignItems: 'center' }}>
      <svg viewBox="0 0 128 128" width={size} height={size} role="img" aria-label={`${label}: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        {!total && <circle cx={c} cy={c} r={43} fill="none" stroke="var(--border-soft)" strokeWidth={18} />}
        {arcs.map(({ s, d }) =>
          d ? (
            <path key={s.label} d={d} fill={s.color}>
              <title>
                {s.label}: {s.value}
              </title>
            </path>
          ) : (
            <circle key={s.label} cx={c} cy={c} r={43} fill="none" stroke={s.color} strokeWidth={18} />
          ),
        )}
        <text x={c} y={62} textAnchor="middle" fill="var(--ink)" fontSize={20} fontWeight={600}>
          {total}
        </text>
        <text x={c} y={78} textAnchor="middle" fill="var(--muted)" fontSize={9}>
          {label}
        </text>
      </svg>
      <div style={{ minWidth: 0 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ fontSize: 12, margin: '3px 0', whiteSpace: 'nowrap' }}>
            <i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: s.color, marginRight: 6 }} />
            {s.label} <b>{s.value}</b> {total ? <span className="muted">{Math.round((s.value / total) * 100)}%</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars with labels and values. */
export function HBars({ items, color = 'var(--info)' }: { items: { label: string; value: number; color?: string; note?: string }[]; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <div className="muted">Nothing yet.</div>;
  return (
    <div>
      {items.map((i) => (
        <div key={i.label} style={{ margin: '7px 0' }}>
          <div className="row between" style={{ fontSize: 12 }}>
            <span>
              {i.label} {i.note && <span className="muted">{i.note}</span>}
            </span>
            <b>{i.value}</b>
          </div>
          <div className="bar" style={{ height: 7 }}>
            <span style={{ width: `${(i.value / max) * 100}%`, background: i.color ?? color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export const PALETTE = ['var(--block)', 'var(--human)', 'var(--ink)', 'var(--muted)', 'var(--allow)', 'var(--warn)'];

/** Fleet-scale "speed vs control": stacked outcomes per bucket, gateway p95 on the right axis. */
export function BigSpeedChart({ points, bucketMs }: { points: { t: number; auto: number; held: number; blocked: number; p95: number }[]; bucketMs: number }) {
  const W = 1200,
    H = 440,
    L = 52,
    R = 78,
    T = 30,
    B = 42;
  const max = Math.max(4, ...points.map((p) => p.auto + p.held + p.blocked));
  const nice = Math.ceil(max / 4) * 4;
  const maxMs = Math.max(1, ...points.map((p) => p.p95));
  const bw = (W - L - R) / Math.max(1, points.length);
  const y = (v: number) => H - B - (v / nice) * (H - T - B);
  const ym = (v: number) => H - B - (v / (maxMs * 1.15)) * (H - T - B);
  const line = points.map((p, i) => (p.p95 ? [L + i * bw + bw / 2, ym(p.p95)] : null)).filter((x): x is number[] => x !== null);
  const hhmm = (t: number) => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const every = Math.max(1, Math.round(points.length / 6));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Every agent action over time by outcome, with gateway p95 latency">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--line)" />
          <text x={L - 10} y={y(nice * f) + 4} fill="var(--muted-2)" fontSize={15} textAnchor="end">
            {Math.round(nice * f)}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const x = L + i * bw + 2;
        const a = y(p.auto),
          h = y(p.auto + p.held),
          b = y(p.auto + p.held + p.blocked);
        const w = Math.max(2, bw - 4);
        return (
          <g key={p.t}>
            <rect x={x} y={a} width={w} height={H - B - a} fill="var(--allow)" opacity={0.85} rx={2} />
            <rect x={x} y={h} width={w} height={a - h} fill="var(--human)" />
            <rect x={x} y={b} width={w} height={h - b} fill="var(--block)" rx={2} />
            <rect x={x - 2} y={T} width={bw} height={H - T - B} fill="transparent">
              <title>{`${hhmm(p.t)} · ${p.auto} on their own · ${p.held} asked a person · ${p.blocked} refused · p95 ${p.p95 ? p.p95.toFixed(1) : '—'} ms`}</title>
            </rect>
            {i % every === 0 && (
              <text x={L + i * bw + bw / 2} y={H - 12} fill="var(--muted-2)" fontSize={15} textAnchor="middle">
                {hhmm(p.t)}
              </text>
            )}
          </g>
        );
      })}
      {line.length > 1 && <polyline points={line.map((q) => q.join(',')).join(' ')} fill="none" stroke="var(--ink)" strokeWidth={1.6} strokeDasharray="4 4" opacity={0.8} />}
      {line.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={2.6} fill="var(--ink)" />
      ))}
      <text x={W - R + 10} y={ym(maxMs) + 4} fill="var(--muted)" fontSize={15}>
        {maxMs.toFixed(1)} ms
      </text>
      <text x={W - R + 10} y={H - B + 4} fill="var(--muted-2)" fontSize={15}>
        0 ms
      </text>
      <text x={L} y={16} fill="var(--muted-2)" fontSize={15}>
        actions per {bucketMs >= 3_600_000 ? 'hour' : '2 min'}
      </text>
    </svg>
  );
}
