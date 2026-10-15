'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AbhedMark } from './mark';

export type SiteAccount = {
  id: string;
  email: string;
  name: string;
  company: string | null;
  role: string | null;
  created_at: string;
  last_login_at?: string | null;
  title?: string | null;
  phone?: string | null;
  location?: string | null;
  website?: string | null;
  bio?: string | null;
  avatar_v?: number | null;
};

/** The signed-in person (or null), read once from the session cookie on the server. */
export function useAccount() {
  const [account, setAccount] = useState<SiteAccount | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { account: SiteAccount | null }) => live && setAccount(j.account))
      .catch(() => live && setAccount(null));
    return () => {
      live = false;
    };
  }, []);
  return [account, setAccount] as const;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** The person's photo, or their initials when they have none. */
export function Avatar({ account }: { account: Pick<SiteAccount, 'name' | 'avatar_v'> }) {
  // eslint-disable-next-line @next/next/no-img-element
  return account.avatar_v ? <img src={`/api/auth/avatar?v=${account.avatar_v}`} alt="" draggable={false} /> : <>{initials(account.name)}</>;
}

const LINKS = [
  ['/about', 'About us'],
  ['/story', 'How it works'],
  ['/faq', 'FAQ'],
  ['/contact', 'Contact us'],
] as const;

/** Light by default; the choice is remembered on this device. Works before and after sign-in. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('abhed-theme', next);
    } catch {
      /* private mode */
    }
  };
  return (
    <button className="theme-btn" onClick={flip} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}


/** The bar everyone sees before signing in: the same on every public page. */
export function PublicNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  // On the sign-in pages, keep where the visitor was heading when they switch between the two.
  const [carry, setCarry] = useState('');
  useEffect(() => {
    setOpen(false);
    const next = new URLSearchParams(window.location.search).get('next');
    setCarry(next && /^\/(login|signup)$/.test(path) ? `?next=${encodeURIComponent(next)}` : '');
  }, [path]);
  useEffect(() => {
    const close = (e: Event) => {
      if (open && ref.current && !(e.target instanceof Node && ref.current.contains(e.target))) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <header className={`st-nav ${open ? 'open' : ''}`} ref={ref}>
      <div className="st-nav-in">
        <Link href="/" className="st-brand" aria-label="Abhed home">
          <AbhedMark size={24} />
          <span>Abhed</span>
        </Link>
        <nav className="st-links" aria-label="Site">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? 'on' : ''}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="st-right">
          <ThemeToggle />
          <Link href={`/login${carry}`} className={`st-signin ${path === '/login' ? 'on' : ''}`}>
            Sign in
          </Link>
          <Link href={`/signup${carry}`} className="st-pill">
            Get started
          </Link>
          <button className="st-burger" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="st-menu" onClick={() => setOpen((v) => !v)}>
            <i />
            <i />
          </button>
        </div>
      </div>
      <div className="st-menu" id="st-menu" hidden={!open}>
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className={path === href ? 'on' : ''}>
            {label}
          </Link>
        ))}
        <div className="st-menu-foot">
          <Link href={`/login${carry}`}>Sign in</Link>
          <Link href={`/signup${carry}`} className="st-pill">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Every public page: the same bar, the page, the same footer. */
export function PublicChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="st">
      <PublicNav />
      {children}
      <SiteFooter />
    </div>
  );
}

const FOOT: { h: string; links: [string, string, boolean?][] }[] = [
  { h: 'Product', links: [['/demo', 'Live demo', true], ['/fleet', 'Fleet monitor', true], ['/connect', 'Connect a company', true], ['/business', 'Pricing', true], ['/approver', 'Approver app']] },
  { h: 'Resources', links: [['/story', 'How it works'], ['/integrate', 'Integration guide', true], ['/faq', 'FAQ'], ['/readiness', 'Roadmap', true]] },
  { h: 'Company', links: [['/about', 'About us'], ['/contact', 'Contact us'], ['/signup', 'Create an account'], ['/login', 'Sign in']] },
  { h: 'Trust', links: [['/security', 'Security', true], ['/privacy', 'Privacy policy'], ['/terms', 'Terms of use']] },
];

/** A one-line health check of the running gateway, read once per page. */
function FooterStatus() {
  const [p, setP] = useState<{ last5: number; p95_5m: number | null } | null | false>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/fleet', { cache: 'no-store' })
      .then((r) => r.json())
      .then((f: { pulse: { last5: number; p95_5m: number | null } }) => live && setP(f.pulse))
      .catch(() => live && setP(false));
    return () => {
      live = false;
    };
  }, []);
  if (p === false) return <span className="ft-status off">Status unavailable</span>;
  return (
    <span className="ft-status" aria-live="polite">
      <i aria-hidden="true" />
      {p ? `Gateway live · ${p.last5.toLocaleString('en-IN')} decisions in 5 min${p.p95_5m !== null ? ` · p95 ${p.p95_5m.toFixed(1)} ms` : ''}` : 'Checking the gateway…'}
    </span>
  );
}

const Lock = () => (
  <svg className="ft-lock" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
    <path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
  </svg>
);

/** The same footer on every page. Feature links ask a signed-out visitor to sign in first (the lock says so). */
export function SiteFooter({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <footer className="st-foot ft">
      <div className="ft-in">
        <div className="ft-cta">
          <div>
            <p className="ft-eyebrow">Abhed · अभेद</p>
            <h2>
              Put a gate in front of every <em>AI agent.</em>
            </h2>
          </div>
          <div className="ft-cta-act">
            <Link href={signedIn ? '/demo' : '/signup?next=%2Fdemo'} className="ft-btn solid">
              {signedIn ? 'Open the live demo' : 'Get started free'}
            </Link>
            <Link href="/contact" className="ft-btn">
              Talk to the team
            </Link>
          </div>
        </div>

        <div className="ft-main">
          <div className="ft-brand">
            <Link href="/" className="ft-logo" aria-label="Abhed home">
              <AbhedMark size={26} />
              <span>Abhed</span>
            </Link>
            <p>The accountability layer for AI agents. One gate for every action, a person for the big ones, a ledger no one can edit.</p>
            <FooterStatus />
            <div className="ft-social">
              <a href="https://github.com/HarshDubey23/hackarena" target="_blank" rel="noopener noreferrer" aria-label="Abhed source on GitHub">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
                </svg>
              </a>
              <Link href="/contact" aria-label="Write to the team">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
              </Link>
            </div>
          </div>
          <nav className="ft-cols" aria-label="Footer">
            {FOOT.map((c) => (
              <div key={c.h}>
                <h3>{c.h}</h3>
                <ul>
                  {c.links.map(([href, label, gated]) => (
                    <li key={href}>
                      <Link href={href} title={gated && !signedIn ? 'Sign in to open' : undefined}>
                        {label}
                        {gated && !signedIn && <Lock />}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="ft-word" aria-hidden="true">
          अभेद
        </div>

        <div className="ft-base">
          <span>© 2026 Abhed. A working prototype built for CodeX 3.0. Companies in the demo are fictional.</span>
          <span className="ft-base-r">
            <span>Made in India</span>
            <button type="button" className="ft-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              Back to top
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
              </svg>
            </button>
          </span>
        </div>
      </div>
    </footer>
  );
}

type FeedRow = { seq: number; ts: number; company: string; actor: string; action: string; decision: string; ruleRef?: string };
const WORD: Record<string, string> = { ALLOWED: 'allowed', EXECUTED: 'executed', NEEDS_APPROVAL: 'sent to a person', BLOCKED: 'refused' };
const TONE: Record<string, string> = { ALLOWED: 'ok', EXECUTED: 'ok', NEEDS_APPROVAL: 'hold', BLOCKED: 'no' };

/** The last few real decisions, refreshed every few seconds. */
export function LiveFeed({ rows = 4 }: { rows?: number }) {
  const [feed, setFeed] = useState<FeedRow[] | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let live = true;
    const pull = () =>
      fetch('/api/fleet', { cache: 'no-store' })
        .then((r) => r.json())
        .then((f: { now: number; feed: FeedRow[] }) => {
          if (!live) return;
          setNow(f.now);
          setFeed(f.feed.filter((x) => WORD[x.decision]).slice(0, rows));
        })
        .catch(() => live && setFeed((v) => v ?? []));
    void pull();
    const t = setInterval(pull, 6000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [rows]);
  const ago = (ts: number) => {
    const s = Math.max(1, Math.round((now - ts) / 1000));
    return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
  };
  if (!feed) return <div className="st-feed muted">Connecting to the live ledger…</div>;
  if (!feed.length) return <div className="st-feed muted">Quiet right now. Every decision appears here as it happens.</div>;
  return (
    <ul className="st-feed" aria-live="polite">
      {feed.map((r) => (
        <li key={`${r.company}-${r.seq}`}>
          <i className={TONE[r.decision]} />
          <span>
            <b>{r.actor}</b> {r.action.replace(/_/g, ' ')} · {WORD[r.decision]}
          </span>
          <em>{ago(r.ts)}</em>
        </li>
      ))}
    </ul>
  );
}
