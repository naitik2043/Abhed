'use client';

import { useEffect, useRef, useState } from 'react';

/** Background video that starts muted and never shows controls; a still frame if autoplay is refused. */
export function PlayVideo({ src }: { src: string }) {
  const v = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = v.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return el.pause();
    void el.play().catch(() => undefined);
  }, []);
  return <video ref={v} className="lh-video" src={src} autoPlay muted loop playsInline preload="auto" />;
}

/** The ABHED title sequence: once per visit, skipped by a click or a key, never for reduced motion. */
export function Intro() {
  const [state, setState] = useState<'off' | 'on' | 'out'>('off');
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem('abhed-intro') === '1';
    } catch {
      /* private mode */
    }
    if (seen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setState('on');
    const end = () => {
      setState((s) => (s === 'on' ? 'out' : s));
      try {
        sessionStorage.setItem('abhed-intro', '1');
      } catch {
        /* private mode */
      }
    };
    const t = setTimeout(end, 3900);
    window.addEventListener('keydown', end, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', end);
    };
  }, []);
  useEffect(() => {
    if (state !== 'out') return;
    const t = setTimeout(() => setState('off'), 1150);
    return () => clearTimeout(t);
  }, [state]);
  if (state === 'off') return null;
  return (
    <div className={`lh-intro ${state === 'out' ? 'out' : ''}`} role="presentation" onClick={() => setState('out')}>
      <svg className="lh-intro-mark" viewBox="0 0 31.5 48.5" aria-hidden="true">
        <defs>
          <linearGradient id="lhg" x1="8" y1="0" x2="34.1" y2="28.9" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#9e9e9e" />
            <stop offset=".34" stopColor="#a3a3a3" />
            <stop offset=".40" stopColor="#3a3a3a" />
            <stop offset=".55" stopColor="#414141" />
            <stop offset=".68" stopColor="#8e8e8e" />
            <stop offset="1" stopColor="#cccccc" />
          </linearGradient>
        </defs>
        <path d="M21.5 0 L21.5 19.5 L31.5 19.5 L31.5 29 L10 48.5 L10 28.5 L0.5 28.5 L0.5 18.5 Z" fill="url(#lhg)" />
        <rect x="0.5" y="18.5" width="9" height="10" fill="#fdfdfd" />
        <rect x="22" y="19.5" width="9.5" height="9.5" fill="#fdfdfd" />
      </svg>
      <div className="lh-intro-word">ABHED</div>
      <div className="lh-intro-rule" />
      <div className="lh-intro-dev">अभेद</div>
      <div className="lh-intro-cap">impenetrable</div>
      <div className="lh-intro-skip">click to skip</div>
    </div>
  );
}
