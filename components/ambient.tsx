'use client';

import { useEffect, useRef } from 'react';

/**
 * Ambient layer: a quiet field of nodes behind every page. Signals travel along its edges, and each new record
 * on the ledger sends one bright pulse through it, so the background moves with the real system, not on a loop.
 * Cheap by design: ≤ 30 fps, at most ~40 nodes, paused when the tab is hidden, a still frame for reduced motion.
 */
export function AmbientField({ beat }: { beat: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fire = useRef<(n: number) => void>(() => undefined);
  const last = useRef<number | null>(null);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    type Node = { x: number; y: number; ox: number; oy: number; ph: number; nb: number[] };
    type Sig = { path: number[]; t: number; speed: number; hot: boolean };
    let nodes: Node[] = [];
    let sigs: Sig[] = [];
    let W = 0;
    let H = 0;

    const layout = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.max(4, Math.round(W / 220));
      const rows = Math.max(3, Math.round(H / 200));
      // a fixed seed keeps the field identical between visits: it reads as structure, not noise
      let s = 7;
      const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
      nodes = [];
      for (let r = 0; r <= rows; r++)
        for (let c = 0; c <= cols; c++) {
          if (rnd() < 0.18) continue;
          const x = (c / cols) * W + (rnd() - 0.5) * (W / cols) * 0.7;
          const y = (r / rows) * H + (rnd() - 0.5) * (H / rows) * 0.7;
          nodes.push({ x, y, ox: x, oy: y, ph: rnd() * Math.PI * 2, nb: [] });
        }
      const reach = Math.max(W / cols, H / rows) * 1.35;
      nodes.forEach((a, i) => {
        a.nb = nodes
          .map((b, j) => ({ j, d: Math.hypot(a.ox - b.ox, a.oy - b.oy) }))
          .filter((o) => o.j !== i && o.d < reach)
          .sort((p, q) => p.d - q.d)
          .slice(0, 3)
          .map((o) => o.j);
      });
      sigs = [];
    };

    const spawn = (hot: boolean) => {
      if (!nodes.length) return;
      let at = Math.floor(Math.random() * nodes.length);
      const path = [at];
      for (let k = 0; k < 3 + Math.floor(Math.random() * 3); k++) {
        const nb = nodes[at].nb.filter((j) => !path.includes(j));
        if (!nb.length) break;
        at = nb[Math.floor(Math.random() * nb.length)];
        path.push(at);
      }
      if (path.length > 1) sigs.push({ path, t: 0, speed: hot ? 0.035 : 0.014, hot });
      if (sigs.length > 14) sigs.shift();
    };
    fire.current = (n: number) => {
      for (let i = 0; i < Math.min(n, 4); i++) spawn(true);
    };

    const colors = () => {
      const light = document.documentElement.dataset.theme === 'light';
      return light
        ? { line: 'rgba(0,0,0,0.045)', node: 'rgba(0,0,0,0.13)', sig: '56,198,236', hot: '56,198,236' }
        : { line: 'rgba(255,255,255,0.035)', node: 'rgba(255,255,255,0.11)', sig: '255,255,255', hot: '255,255,255' };
    };

    const draw = (time: number) => {
      const c = colors();
      ctx.clearRect(0, 0, W, H);
      for (const n of nodes) {
        n.x = n.ox + Math.sin(time / 4200 + n.ph) * 6;
        n.y = n.oy + Math.cos(time / 5100 + n.ph) * 6;
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = c.line;
      ctx.beginPath();
      nodes.forEach((a, i) =>
        a.nb.forEach((j) => {
          if (j < i) return;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
        }),
      );
      ctx.stroke();
      ctx.fillStyle = c.node;
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const s of sigs) {
        const seg = Math.min(Math.floor(s.t), s.path.length - 2);
        const f = s.t - seg;
        const a = nodes[s.path[seg]];
        const b = nodes[s.path[seg + 1]];
        if (!a || !b) continue;
        const x = a.x + (b.x - a.x) * f;
        const y = a.y + (b.y - a.y) * f;
        const alpha = s.hot ? 0.85 : 0.4;
        const g = ctx.createLinearGradient(a.x, a.y, x, y);
        g.addColorStop(0, `rgba(${s.hot ? c.hot : c.sig},0)`);
        g.addColorStop(1, `rgba(${s.hot ? c.hot : c.sig},${alpha})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = s.hot ? 1.6 : 1.1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.fillStyle = `rgba(${s.hot ? c.hot : c.sig},${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, s.hot ? 2.4 : 1.8, 0, Math.PI * 2);
        ctx.fill();
        // arrival: a small ring where the decision lands
        if (s.t >= s.path.length - 1.25) {
          const end = nodes[s.path[s.path.length - 1]];
          const k = (s.t - (s.path.length - 1.25)) / 1.25;
          ctx.strokeStyle = `rgba(${s.hot ? c.hot : c.sig},${(1 - k) * alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(end.x, end.y, 3 + k * 14, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    };

    layout();
    if (still) {
      draw(0);
      return;
    }
    let raf = 0;
    let prev = 0;
    let nextIdle = 0;
    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || time - prev < 33) return;
      const dt = Math.min(64, time - prev) / 16.7;
      prev = time;
      if (time > nextIdle) {
        spawn(false);
        nextIdle = time + 1400 + Math.random() * 1600;
      }
      for (const s of sigs) s.t += s.speed * dt;
      sigs = sigs.filter((s) => s.t < s.path.length);
      draw(time);
    };
    raf = requestAnimationFrame(loop);
    let rt = 0;
    const onResize = () => {
      clearTimeout(rt);
      rt = window.setTimeout(layout, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // every new ledger record sends a pulse through the field
  useEffect(() => {
    if (last.current !== null && beat > last.current) fire.current(beat - last.current);
    last.current = beat;
  }, [beat]);

  return <canvas ref={ref} className="q-field" aria-hidden="true" />;
}

/** Big numbers shrink just enough to fit their tile, so a long amount never gets cut. */
export function useFitText(selector = '.kpi-value, .fl-big b, .wr-v') {
  useEffect(() => {
    let raf = 0;
    const fit = () => {
      raf = 0;
      document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        el.style.fontSize = '';
        let size = parseFloat(getComputedStyle(el).fontSize);
        let guard = 0;
        while (el.scrollWidth > el.clientWidth + 1 && size > 14 && guard++ < 30) {
          size -= 1;
          el.style.fontSize = `${size}px`;
        }
      });
    };
    const later = () => {
      if (!raf) raf = requestAnimationFrame(fit);
    };
    later();
    const mo = new MutationObserver(later);
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    window.addEventListener('resize', later);
    void document.fonts?.ready.then(later);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener('resize', later);
    };
  }, [selector]);
}

/** Live numbers glint when the data changes them (never on first render). */
export function useNumberGlint() {
  useEffect(() => {
    const SEL = '.kpi-value, .fl-big b, .fl-row b, .fl-co-stats b, [data-live]';
    const seen = new WeakMap<Element, string>();
    const check = (el: Element | null) => {
      if (!el) return;
      const t = el.textContent ?? '';
      const before = seen.get(el);
      seen.set(el, t);
      if (before === undefined || before === t) return;
      el.classList.remove('q-tick');
      void (el as HTMLElement).offsetWidth;
      el.classList.add('q-tick');
    };
    document.querySelectorAll(SEL).forEach((el) => seen.set(el, el.textContent ?? ''));
    const mo = new MutationObserver((list) => {
      const hit = new Set<Element>();
      for (const m of list) {
        const node = m.target.nodeType === 3 ? m.target.parentElement : (m.target as Element);
        const el = node?.closest?.(SEL);
        if (el) hit.add(el);
        m.addedNodes.forEach((n) => n instanceof Element && n.querySelectorAll(SEL).forEach((x) => seen.has(x) || seen.set(x, x.textContent ?? '')));
      }
      hit.forEach(check);
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, []);
}

const BAND_VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_125119_4963ddd4-c287-4044-b014-b68943cdd8bd.mp4';
const BAND_POSTER = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_125039_45a71f04-36dd-4620-99d8-7526316d439e.png';

/** A full-bleed moving band that cards sit on (cyan in light, monochrome in dark). */
export function Band({ children }: { children: React.ReactNode }) {
  const v = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) v.current?.pause();
  }, []);
  return (
    <div className="q-stage">
      <div className="q-band" role="presentation">
        <video ref={v} className="q-band-video" autoPlay muted loop playsInline preload="metadata" poster={BAND_POSTER} src={BAND_VIDEO} />
      </div>
      <div className="q-on-band">{children}</div>
    </div>
  );
}
