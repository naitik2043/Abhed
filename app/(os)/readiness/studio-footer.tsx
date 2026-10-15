'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import gazeFrames from './gaze-frames.json';

const VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260908_073327_03643c0a-db33-417a-ae8f-4a39259c7f9c.mp4';
const TAU = Math.PI * 2;
const wrappedAngle = (angle: number) => ((angle % TAU) + TAU) % TAU;

// These angles were measured from the actual pupil positions in the clip's
// first complete orbit. Match direction, rather than assuming constant speed.
function timeForAngle(angle: number) {
  const target = wrappedAngle(angle);
  let nearestTime = gazeFrames[0][1];
  let nearestDistance = Infinity;
  for (const [sampleAngle, time] of gazeFrames) {
    const difference = Math.abs(target - sampleAngle);
    const distance = Math.min(difference, TAU - difference);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestTime = time;
    }
  }
  return nearestTime + 1 / 240;
}

/** The character's recorded pupils follow the cursor: each pointer direction seeks to the frame where it looks there. */
function FooterBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current!;
    let frame = 0;
    let desiredTime = 0;
    let pointer: { x: number; y: number } | null = null;
    let disposed = false;
    const mobile = window.matchMedia('(max-width: 700px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const seek = () => {
      frame = 0;
      if (disposed || mobile.matches || video.readyState < 2 || video.seeking) return;
      if (Math.abs(video.currentTime - desiredTime) > 1 / 48) {
        video.currentTime = Math.min(desiredTime, video.duration - 1 / 24);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(seek);
    };
    const updateTarget = () => {
      if (mobile.matches || !pointer) return;
      const rect = video.getBoundingClientRect();
      const scale = Math.max(rect.width / 1920, rect.height / 1080);
      // Match the exact object-fit: cover positioning.
      const eyeX = rect.left + rect.width / 2 + (948 - 960) * scale;
      const eyeY = rect.top + rect.height / 2 + (418 - 540) * scale;
      const dx = pointer.x - eyeX;
      const dy = pointer.y - eyeY;
      // Avoid unstable angles directly between the eyes.
      if (Math.hypot(dx, dy) > 8) {
        desiredTime = timeForAngle(Math.atan2(dy, dx));
        schedule();
      }
    };
    const move = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      updateTarget();
    };
    const ready = () => {
      video.loop = mobile.matches;
      if (mobile.matches && !reducedMotion.matches) {
        void video.play().catch(() => {
          /* Keep the first frame if autoplay is unavailable. */
        });
      } else {
        video.pause();
        if (!mobile.matches) {
          updateTarget();
          schedule();
        }
      }
    };
    // Coalesce fast pointer movements while a frame is decoding. When it
    // finishes, seek immediately to the latest requested gaze direction.
    video.addEventListener('seeked', schedule);
    video.addEventListener('loadeddata', ready);
    mobile.addEventListener('change', ready);
    reducedMotion.addEventListener('change', ready);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('resize', updateTarget);
    window.addEventListener('scroll', updateTarget, { passive: true });
    if (video.readyState >= 2) ready();

    // Seeking inside a fully buffered blob is near instant; range requests over the network are not.
    // If the host refuses a cross-origin fetch, the element simply keeps streaming the URL.
    const ctrl = new AbortController();
    let blobUrl = '';
    fetch(VIDEO, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (disposed) return;
        const t = video.currentTime;
        blobUrl = URL.createObjectURL(b);
        video.src = blobUrl;
        video.currentTime = t;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      ctrl.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      cancelAnimationFrame(frame);
      video.removeEventListener('seeked', schedule);
      video.removeEventListener('loadeddata', ready);
      mobile.removeEventListener('change', ready);
      reducedMotion.removeEventListener('change', ready);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('resize', updateTarget);
      window.removeEventListener('scroll', updateTarget);
    };
  }, []);

  return (
    <div className="sf-bg" aria-hidden="true">
      <video ref={videoRef} muted playsInline preload="auto" src={VIDEO} />
    </div>
  );
}

const Icon = {
  github: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" />
      <path d="M10 8.2v7.6l6-3.8z" fill="currentColor" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="6" y="1.8" width="12" height="20.4" rx="2.6" />
      <path d="M10.5 18.6h3" />
    </svg>
  ),
};

/** Readiness closes on a studio-style footer: two text columns, the name in the middle, and a character who watches the cursor. */
export default function StudioFooter() {
  return (
    <footer className="sf-footer" aria-label="Footer">
      <FooterBackground />
      <div className="sf-jobs">
        <span className="sf-tag">ready to govern?</span>
        <span className="sf-headline sf-job-title">
          every action
          <br />
          signed &amp; sealed
        </span>
        <nav className="sf-nav" aria-label="Footer">
          <Link href="/demo">Live demo</Link>
          <Link href="/fleet">Fleet</Link>
          <Link href="/story">How it works</Link>
          <Link href="/connect">Connect</Link>
        </nav>
      </div>
      <div className="sf-logo" role="img" aria-label="Abhed">
        <span aria-hidden="true">अभेद</span>
      </div>
      <div className="sf-contact">
        <span className="sf-tag">start today</span>
        <div className="sf-headline sf-contact-links">
          <span>connect a company</span>
          <span>watch it govern*</span>
        </div>
        <p className="sf-note">*no code change. paste a base URL and a key.</p>
        <div className="sf-socials">
          <a href="https://github.com/HarshDubey23/hackarena" target="_blank" rel="noopener noreferrer" aria-label="Source on GitHub">
            {Icon.github}
          </a>
          <Link href="/story" aria-label="How Abhed works">
            {Icon.play}
          </Link>
          <Link href="/approver" aria-label="Approver phone app">
            {Icon.phone}
          </Link>
        </div>
      </div>
    </footer>
  );
}
