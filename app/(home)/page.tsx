import type { Metadata } from 'next';
import Link from 'next/link';
import { Intro, PlayVideo } from './intro';

export const metadata: Metadata = {
  title: 'Abhed · The accountability layer for AI agents',
  description: 'One gate for every action your AI agents take. The right person approves the big ones, and every action lands on a ledger no one can edit.',
};

const VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260808_112712_da9d53df-6d27-4b12-bdf6-aa9dc2622bdf.mp4';

export default function Home() {
  return (
    <>
      <section className="lh">
        <div className="lh-plate" aria-hidden="true">
          <PlayVideo src={VIDEO} />
        </div>
        <div className="lh-in">
          <h1 className="lh-h1">
            <span>The Accountability</span> <span>Layer for AI Agents</span>
          </h1>
          <p className="lh-sub">
            <span>One gate for every action your AI agents take.</span> <span>The right person signs the big ones, on a ledger no one can edit.</span>
          </p>
          <div className="lh-actions">
            <Link className="lh-pill" href="/demo">
              Start live demo
            </Link>
            <Link className="lh-ghost" href="/story">
              See how it works
            </Link>
          </div>
        </div>
        <div className="lh-logos" aria-label="Companies governed in the demo">
          <a href="https://abhed-novabank.onrender.com" target="_blank" rel="noopener noreferrer" aria-label="NovaBank, a governed demo company">
            <svg viewBox="0 0 30 31" aria-hidden="true">
              <defs>
                <mask id="lhm1">
                  <rect width="30" height="31" fill="#fff" />
                  <circle cx="19.5" cy="10.5" r="5.1" fill="#000" />
                </mask>
              </defs>
              <rect x="0" y="1" width="30" height="30" rx="2" fill="currentColor" mask="url(#lhm1)" />
              <circle cx="19.5" cy="10.5" r="2.6" fill="currentColor" />
            </svg>
            <b>novabank</b>
          </a>
          <a href="https://abhed-sanjeevani.onrender.com" target="_blank" rel="noopener noreferrer" aria-label="Sanjeevani Hospital, a governed demo company">
            <svg viewBox="0 0 25 30" aria-hidden="true">
              <defs>
                <mask id="lhm2">
                  <rect width="25" height="30" fill="#fff" />
                  <rect x="16.5" y="0" width="9" height="15" fill="#000" />
                </mask>
              </defs>
              <rect x="0" y="0" width="7" height="30" rx="1" fill="currentColor" />
              <circle cx="16.5" cy="15" r="8.5" fill="currentColor" mask="url(#lhm2)" />
              <circle cx="16.5" cy="15" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <b>sanjeevani</b>
          </a>
          <a href="https://abhed-bazaar.onrender.com" target="_blank" rel="noopener noreferrer" aria-label="Bazaar.in, a governed demo company">
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <circle cx="14" cy="14" r="12.35" fill="none" stroke="currentColor" strokeWidth="3.1" />
              <path d="M7.5 15.5c2.2-4.6 7.8-4.6 10-.6" fill="none" stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" />
              <path d="M11 19.5c1.6-1.8 4.4-1.8 6 0" fill="none" stroke="currentColor" strokeWidth="3.1" strokeLinecap="round" />
            </svg>
            <b>bazaar.in</b>
          </a>
          <Link href="/connect" aria-label="Your company: connect it to Abhed">
            <svg viewBox="0 0 28 25.5" aria-hidden="true">
              <path d="M1 13.5C4 4.5 9 1 14 1s10 3.5 13 12.5z" fill="currentColor" />
              <path d="M1.5 18.2c4.2-2.4 8.4 2.4 12.5 0s8.3-2.4 12.5 0" fill="none" stroke="currentColor" strokeWidth="3.05" strokeLinecap="round" />
              <path d="M1.5 23.6c4.2-2.4 8.4 2.4 12.5 0s8.3-2.4 12.5 0" fill="none" stroke="currentColor" strokeWidth="3.05" strokeLinecap="round" />
            </svg>
            <b>your company</b>
          </Link>
        </div>
      </section>
      <Intro />
    </>
  );
}
