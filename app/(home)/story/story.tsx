'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/*
 * How Abhed works, scrubbed by scroll. The scene is drawn in code: it is a pure function of scroll progress, so
 * scrubbing lands on an exact frame instantly in both directions, with nothing to download or seek. Panels own
 * slices of progress with dead zones between them (scene only), so two panels are never readable at once.
 * The stage is sticky inside a tall track: it pins under the page's bar, then scrolls away into the footer.
 */
const CUES: [number, number, number, number][] = [
  [0.0, 0.0, 0.15, 0.23],
  [0.35, 0.43, 0.57, 0.65],
  [0.77, 0.85, 1.1, 1.2],
];
const DRIFT = 22;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const ramp = (p: number, a: number, b: number) => (b <= a ? (p >= b ? 1 : 0) : smooth(clamp((p - a) / (b - a), 0, 1)));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const ALLOW = '31,138,82';
const HUMAN = '194,122,18';
const BLOCK = '200,55,45';
const CYAN = '56,198,236';
const AGENTS = ['Rex', 'Aria', 'Atlas'];
const N = 30;
const KIND = Array.from({ length: N }, (_, k) => (k % 7 === 3 ? 'held' : k % 5 === 4 ? 'block' : 'allow')) as ('allow' | 'held' | 'block')[];
const WORD: Record<string, string> = { ALLOWED: 'allowed', EXECUTED: 'executed', NEEDS_APPROVAL: 'sent to a person', BLOCKED: 'refused' };

export function Story() {
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const meter = useRef<HTMLElement>(null);
  const panels = useRef<(HTMLElement | null)[]>([]);
  const [live, setLive] = useState('Abhed · the accountability layer for AI agents');

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext('2d')!;
    const st = stage.current!;
    const tr = track.current!;
    let W = 0;
    let H = 0;
    let textBottom = 0;
    let progress = 0;
    let seekAt = 0;
    let raf = 0;
    let INK = '13,12,11';
    let SHADE = '#f2f0ec';
    const font = () => getComputedStyle(st).fontFamily;
    const colors = () => {
      const cs = getComputedStyle(st);
      INK = cs.getPropertyValue('--sy-ink-rgb').trim() || INK;
      SHADE = cs.getPropertyValue('--sy-shade').trim() || SHADE;
    };
    const size = () => {
      const r = st.getBoundingClientRect();
      W = r.width;
      H = r.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // the scene always starts below the tallest panel's text, so copy and drawing never overlap
      textBottom = 0;
      panels.current.forEach((el) => {
        const c = el?.querySelector('.sy-cta');
        if (c) textBottom = Math.max(textBottom, c.getBoundingClientRect().bottom - r.top + DRIFT);
      });
      colors();
    };
    const read = () => {
      const r = tr.getBoundingClientRect();
      const top = parseFloat(getComputedStyle(st).top) || 0;
      const total = tr.offsetHeight - st.offsetHeight;
      progress = total > 0 ? clamp((top - r.top) / total, 0, 1) : 0;
    };
    const paint = () => {
      if (meter.current) meter.current.style.transform = `scaleX(${progress})`;
      panels.current.forEach((el, i) => {
        if (!el) return;
        const c = CUES[i];
        const enter = ramp(progress, c[0], c[1]);
        const leave = ramp(progress, c[2], c[3]);
        const o = enter * (1 - leave);
        el.style.opacity = String(o);
        el.style.transform = `translate3d(0,${(1 - enter) * DRIFT - leave * DRIFT}px,0)`;
        el.style.pointerEvents = o > 0.6 ? 'auto' : 'none';
      });
    };
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    const scene = (p: number) => {
      const mobile = W < 720;
      const bottom = H - (mobile ? 96 : 104);
      const top = Math.min(Math.max(textBottom + (mobile ? 40 : 56), H * 0.42), bottom - 150);
      const midY = (top + bottom) / 2;
      const ax = mobile ? W * 0.12 : W * 0.16;
      const gx = W * 0.5;
      const ox = mobile ? W * 0.88 : W * 0.82;
      const lane = { allow: top + (bottom - top) * 0.12, held: midY, block: bottom - (bottom - top) * 0.12 };
      const ay = (i: number) => top + (bottom - top) * (0.2 + i * 0.3);
      const ff = font();
      ctx.clearRect(0, 0, W, H);
      const show = ramp(p, 0, 0.08);
      const gateOn = ramp(p, 0.22, 0.4);
      const personOn = ramp(p, 0.62, 0.8);
      ctx.globalAlpha = 0.25 + 0.75 * show;

      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = `rgba(${INK},.13)`;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(ax, ay(i));
        ctx.lineTo(gx, midY);
        ctx.stroke();
      }
      (['allow', 'held', 'block'] as const).forEach((l) => {
        ctx.beginPath();
        ctx.moveTo(gx, midY);
        ctx.lineTo(ox, lane[l]);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      ctx.font = `500 ${mobile ? 11 : 13}px ${ff}`;
      ctx.textAlign = 'center';
      for (let a = 0; a < 3; a++) {
        const y = ay(a);
        const r = mobile ? 13 : 17;
        const breathe = 1 + 0.06 * Math.sin(p * 40 + a);
        ctx.fillStyle = `rgba(${INK},.92)`;
        ctx.beginPath();
        ctx.arc(ax, y, r * breathe, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = SHADE;
        ctx.fillText(AGENTS[a][0], ax, y + 4.5);
        ctx.fillStyle = `rgba(${INK},.55)`;
        if (mobile) ctx.fillText(AGENTS[a], ax, y + r + 16);
        else {
          ctx.textAlign = 'right';
          ctx.fillText(AGENTS[a], ax - r - 12, y + 4.5);
          ctx.textAlign = 'center';
        }
      }

      const gh = (bottom - top) * 0.86 * (0.15 + 0.85 * gateOn);
      ctx.fillStyle = `rgba(${INK},${0.25 + 0.7 * gateOn})`;
      rr(gx - 5, midY - gh / 2, 10, gh, 5);
      ctx.fill();
      if (gateOn > 0.01) {
        ctx.globalAlpha = (0.25 + 0.75 * show) * gateOn;
        ctx.fillStyle = `rgba(${INK},.8)`;
        ctx.font = `500 ${mobile ? 11 : 12.5}px ${ff}`;
        ctx.fillText('ABHED · RULEBOOK', gx, midY - gh / 2 - 14);
        ctx.globalAlpha = 0.25 + 0.75 * show;
      }

      const tally = { allow: 0, held: 0, block: 0 };
      for (let n = 0; n < N; n++) {
        const u = (p - (0.02 + (n / N) * 0.86)) / 0.13;
        if (u <= 0) continue;
        const kind = KIND[n];
        let color = kind === 'allow' ? ALLOW : kind === 'held' ? HUMAN : BLOCK;
        let x: number;
        let y: number;
        if (u < 0.5) {
          const t = smooth(u / 0.5);
          x = lerp(ax, gx - 8, t);
          y = lerp(ay(n % 3), midY, t);
          color = INK;
        } else if (kind === 'block') {
          const b = clamp((u - 0.5) / 0.25, 0, 1);
          if (b >= 1) {
            tally.block++;
            continue;
          }
          ctx.strokeStyle = `rgba(${BLOCK},${1 - b})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(gx - 8, midY, 4 + b * 18, 0, Math.PI * 2);
          ctx.stroke();
          continue;
        } else {
          if (u >= 1) {
            tally[kind]++;
            continue;
          }
          const t2 = smooth(clamp((u - 0.5) / 0.5, 0, 1));
          x = lerp(gx + 8, ox, t2);
          y = lerp(midY, lane[kind], t2);
        }
        ctx.fillStyle = `rgba(${color},1)`;
        ctx.beginPath();
        ctx.arc(x, y, mobile ? 4 : 5, 0, Math.PI * 2);
        ctx.fill();
      }

      const labels = { allow: ['ran on its own', ALLOW], held: ['asked a person', HUMAN], block: ['refused at the gate', BLOCK] } as const;
      ctx.textAlign = 'left';
      (['allow', 'held', 'block'] as const).forEach((l) => {
        const ly = lane[l];
        ctx.fillStyle = `rgba(${labels[l][1]},1)`;
        ctx.beginPath();
        ctx.arc(ox, ly, 4, 0, Math.PI * 2);
        ctx.fill();
        if (!mobile) {
          ctx.font = `500 15px ${ff}`;
          ctx.fillStyle = `rgba(${INK},.9)`;
          ctx.fillText(String(tally[l]), ox + 16, ly + 5);
          ctx.font = `400 12.5px ${ff}`;
          ctx.fillStyle = `rgba(${INK},.55)`;
          ctx.fillText(labels[l][0], ox + 42, ly + 4.5);
        }
      });

      if (personOn > 0.01) {
        ctx.globalAlpha = personOn;
        let px = ox + 150;
        let py = lane.held - 34;
        if (mobile) {
          px = ox - 20;
          py = lane.held - 72;
        }
        ctx.save();
        if (mobile) {
          ctx.translate(px + 20, py + 34);
          ctx.scale(0.55, 0.55);
          ctx.translate(-px - 20, -py - 34);
        }
        ctx.fillStyle = `rgba(${INK},.92)`;
        rr(px, py, 40, 68, 9);
        ctx.fill();
        ctx.fillStyle = SHADE;
        rr(px + 4, py + 7, 32, 52, 5);
        ctx.fill();
        ctx.strokeStyle = `rgba(${ALLOW},${ramp(p, 0.8, 0.88)})`;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px + 13, py + 33);
        ctx.lineTo(px + 18, py + 38);
        ctx.lineTo(px + 27, py + 27);
        ctx.stroke();
        ctx.restore();
        if (!mobile) {
          ctx.setLineDash([2, 5]);
          ctx.strokeStyle = `rgba(${HUMAN},.6)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ox + 4, lane.held);
          ctx.lineTo(px - 6, lane.held);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const blocks = Math.min(14, Math.floor(ramp(p, 0.66, 0.98) * 14));
        const bw = mobile ? 14 : 22;
        const gap = mobile ? 6 : 10;
        const total = blocks * (bw + gap) - gap;
        const bx = W * 0.5 - total / 2;
        const by = bottom + (mobile ? 26 : 34);
        for (let q = 0; q < blocks; q++) {
          const x0 = bx + q * (bw + gap);
          ctx.fillStyle = q === blocks - 1 ? `rgba(${CYAN},1)` : `rgba(${INK},.82)`;
          rr(x0, by, bw, bw, 4);
          ctx.fill();
          if (q < blocks - 1) {
            ctx.strokeStyle = `rgba(${INK},.35)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x0 + bw, by + bw / 2);
            ctx.lineTo(x0 + bw + gap, by + bw / 2);
            ctx.stroke();
          }
        }
        if (!mobile && blocks) {
          ctx.textAlign = 'center';
          ctx.font = `400 12px ${ff}`;
          ctx.fillStyle = `rgba(${INK},.5)`;
          ctx.fillText('ledger · each record sealed to the one before it', W * 0.5, by + bw + 20);
        }
      }
      ctx.globalAlpha = 1;
    };
    // the drawn position eases toward the scroll target instead of snapping: a smooth scrub, not a jumpy one
    const frame = () => {
      const gap = progress - seekAt;
      if (Math.abs(gap) > 0.0004) seekAt += gap * 0.115;
      scene(seekAt);
      paint();
      raf = requestAnimationFrame(frame);
    };
    const onResize = () => {
      size();
      read();
    };
    size();
    read();
    seekAt = progress;
    paint();
    raf = requestAnimationFrame(frame);
    void document.fonts?.ready.then(onResize);
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', onResize);
    // the theme can change while reading: pick up the new ink and paper
    const mo = new MutationObserver(colors);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', onResize);
      mo.disconnect();
    };
  }, []);

  // the real system, live
  useEffect(() => {
    let alive = true;
    const pull = () =>
      fetch('/api/fleet', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((f: { now: number; pulse: { last5: number; connected: number }; feed: { actor: string; action: string; decision: string; ts: number }[] } | null) => {
          if (!alive || !f?.pulse) return;
          const last = f.feed.find((x) => WORD[x.decision]);
          const ago = last ? Math.max(1, Math.round((f.now - last.ts) / 1000)) : 0;
          setLive(
            `live · ${f.pulse.last5} agent decisions in 5 min · ${f.pulse.connected} ${f.pulse.connected === 1 ? 'company' : 'companies'} connected` +
              (last ? ` · last: ${last.actor} ${last.action.replace(/_/g, ' ')} ${WORD[last.decision]}, ${ago < 60 ? `${ago}s` : `${Math.round(ago / 60)} min`} ago` : ''),
          );
        })
        .catch(() => undefined);
    void pull();
    const t = setInterval(pull, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const P = [
    { eyebrow: 'How Abhed works · 1 of 3', h: <>Agents act<br />in milliseconds.</>, sub: 'Refunds, emails, exports, record changes. Your AI agents do real work on their own, faster than anyone can watch.', cta: ['/demo', 'Start the live demo'] },
    { eyebrow: 'The gate', h: <>Every action meets the rulebook first.</>, sub: 'Deterministic rules, not another model. Same input, same decision, decided before the agent’s code can act.', cta: ['/rules', 'Read the rulebook'] },
    { eyebrow: 'The person and the proof', h: <>Big moves wait<br />for a person.</>, sub: 'The right officer approves on their phone. Every decision lands on a ledger no one can edit.', cta: ['/fleet', 'Watch it live'] },
  ] as const;

  return (
    <div className="sy-track" ref={track}>
      <div className="sy-stage" ref={stage}>
        <canvas ref={canvas} aria-hidden="true" />
        <div className="sy-veil" aria-hidden="true" />
        <div className="sy-grain" aria-hidden="true" />
        <i className="sy-meter" ref={meter} aria-hidden="true" />
        {P.map((p, i) => (
          <section
            key={p.eyebrow}
            className="sy-panel"
            ref={(el) => {
              panels.current[i] = el;
            }}
          >
            <p className="sy-eyebrow">{p.eyebrow}</p>
            <h2 className="sy-h">{p.h}</h2>
            <p className="sy-sub">{p.sub}</p>
            <div className="sy-cta">
              <Link className="sy-pill" href={p.cta[0]}>
                {p.cta[1]}
              </Link>
            </div>
          </section>
        ))}
        <p className="sy-live" aria-live="polite">
          <i /> {live}
        </p>
      </div>
    </div>
  );
}
