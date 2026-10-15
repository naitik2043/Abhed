'use client';

import { useEffect, useState } from 'react';

type Pulse = { last5: number; perMin: number; connected: number; online: number; p95_5m: number | null };

/** Four live numbers from the running deployment. */
export function LiveStats() {
  const [p, setP] = useState<Pulse | null>(null);
  const [agents, setAgents] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const pull = () =>
      fetch('/api/fleet', { cache: 'no-store' })
        .then((r) => r.json())
        .then((f: { pulse: Pulse; companies: { agents: unknown[] }[] }) => {
          if (!live) return;
          setP(f.pulse);
          setAgents(f.companies.reduce((n, c) => n + c.agents.length, 0));
        })
        .catch(() => undefined);
    void pull();
    const t = setInterval(pull, 6000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  const v = (n: number | null | undefined, f = (x: number) => x.toLocaleString('en-IN')) => (n === null || n === undefined ? '—' : f(n));
  return (
    <div className="st-stats">
      <div>
        <b data-live>{v(p?.connected)}</b>
        <span>companies connected</span>
      </div>
      <div>
        <b data-live>{v(agents)}</b>
        <span>agents governed</span>
      </div>
      <div>
        <b data-live>{v(p?.last5)}</b>
        <span>decisions in the last 5 min</span>
      </div>
      <div>
        <b data-live>{v(p?.p95_5m, (x) => `${x.toFixed(1)} ms`)}</b>
        <span>gate decision, p95</span>
      </div>
    </div>
  );
}
