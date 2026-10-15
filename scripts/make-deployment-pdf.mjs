import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'node:fs';

const lines = [
  'Abhed — Complete Deployment Guide (v1.0.0)',
  'Main app -> Vercel | Demo sites -> Render | State -> Supabase',
  '',
  'Verified: typecheck clean, 62/62 tests pass, next build succeeds.',
  '',
  '0. WHAT GOES WHERE',
  '- Abhed main (app/, lib/, components/, proxy.ts) -> Vercel',
  '- NovaBank / Sanjeevani / Bazaar (sites/server.mjs + SITE=...) -> Render',
  '- Zentro Logistics (sites/zentro/server.mjs) -> Render',
  '- Shared world + accounts -> Supabase table abhed_state',
  'Frontend: Next.js App Router (home/site/os/auth/approver/attack).',
  'Backend: /api/*, /api/v1/* (SDK), /api/gw/v1/* (OpenAI-compatible).',
  '',
  '1. PREREQUISITES',
  '1) GitHub repo naitik2043/Abhed. 2) Vercel + Render + Supabase accounts.',
  '3) Optional Groq/Gemini keys for real LLM planner. 4) Node 20+.',
  '',
  '2. SUPABASE FIRST (5 min)',
  '1) New project, copy SUPABASE_URL + publishable SUPABASE_KEY.',
  '2) SQL: create table abhed_state(id text pk, version bigint, world jsonb, updated_at).',
  '3) Allow read+write on this table. 4) curl REST -> [] expected.',
  'Without keys app runs in memory (phones wont share world).',
  '',
  '3. LOCAL VERIFY',
  'npm install / npm run typecheck / npm test (62/62) / npm run build.',
  'Sites locally: SITE=novabank KAVACH_URL=http://localhost:3000 node sites/server.mjs',
  '',
  '4. PUSH GITHUB (50+ step-by-step commits, never one giant commit)',
  'git init; remote add origin https://github.com/naitik2043/Abhed.git',
  'git branch -M main; commit folder-by-folder; git push -u origin main.',
  '.env* ignored, only .env.example (placeholders) committed.',
  '',
  '5. VERCEL MAIN APP (10 min)',
  'Import repo, Next.js, region bom1 (vercel.json). Build npm run build.',
  'Env: SUPABASE_URL, SUPABASE_KEY, GROQ_API_KEY?, GEMINI_API_KEY?, DIRECTOR_KEY?.',
  'Deploy. GET /api/health must show store:supabase. Signup + /demo must work.',
  '',
  '6. RENDER DEMO SITES (15 min, Blueprint via render.yaml)',
  'New > Blueprint > select repo > Apply (4 services).',
  'Build npm install. Start node sites/server.mjs (zentro: node sites/zentro/server.mjs).',
  'Health /health. Free tier sleeps ~50s cold start (normal).',
  'SDK sites env: SITE, KAVACH_URL (no slash), ADMIN_PIN, KAVACH_KEYS={}, KAVACH_ADMIN_KEY empty.',
  'Zentro env: only ADMIN_PIN.',
  '',
  '7. LINK SITES TO ABHED (pairing, 2 min/site)',
  'SDK: Connect > SDK > Generate code (10 min) > site /admin > PIN > paste > Pair.',
  'Fleet must show agents online (Rex/Aria, Rxa/Claimy, Shoppy/Pricer).',
  'Zentro no-code: Connect > No code > copy Base URL + kv_gw_* > Zentro /admin > AI provider, stream:false.',
  'curl /api/gw/v1/models with Bearer key must list models.',
  '',
  '8. E2E PROOF',
  'Rex Rs.40000 held > approve on /approver phone > ledger > /ledger verify passes.',
  'Hidden-instruction export BLOCKED + agent paused. New key revokes old (401).',
  '',
  '9. TROUBLESHOOTING',
  'store=memory -> add Supabase vars + Redeploy. 401 -> rotate key. fetch failed -> fix URL.',
  'stream error -> stream:false. Agent 3F2A -> You are <Name> or user field. 429 /admin -> wait 60s.',
  '',
  '10. ENV REFERENCE',
  'Vercel: SUPABASE_URL*, SUPABASE_KEY*, GROQ/GEMINI?, DIRECTOR_KEY?.',
  'Render SDK: KAVACH_URL*, SITE*, ADMIN_PIN*, KAVACH_KEYS (pairing), KAVACH_ADMIN_KEY (pairing).',
  'PORT auto on all hosts; start script is next start.',
  'Full text: DEPLOYMENT.md + deployment.imp in repo root.',
];

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
let page = doc.addPage([595, 842]);
const { width, height } = page.getSize();
let y = height - 50;
page.drawText('Abhed — Deployment Guide', { x: 50, y, size: 20, font: bold, color: rgb(0.05, 0.1, 0.25) });
y -= 22;
page.drawText('Step-by-step: Vercel (main) + Render (4 demo sites) + Supabase', { x: 50, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
y -= 24;

for (const line of lines.slice(2)) {
  const isHead = /^[0-9]+\.|^[A-Z][A-Z .]+$/.test(line) && line.length < 60 && line.length > 0;
  const size = line.startsWith('Abhed') ? 12 : isHead ? 11 : 9;
  const f = isHead || line.startsWith('Abhed') ? bold : font;
  if (line === '') { y -= 8; continue; }
  // wrap
  const maxW = width - 100;
  let text = line;
  while (text.length) {
    let n = text.length;
    while (f.widthOfTextAtSize(text.slice(0, n), size) > maxW && n > 10) n--;
    if (n < text.length) {
      const sp = text.lastIndexOf(' ', n);
      if (sp > 20) n = sp;
    }
    if (y < 60) { page = doc.addPage([595, 842]); y = 842 - 50; }
    page.drawText(text.slice(0, n), { x: 50, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
    y -= size + 4;
    text = text.slice(n).trimStart();
    if (!text) break;
  }
}
page.drawText('Generated for Abhed v1.0.0 — see DEPLOYMENT.md for full guide.', { x: 50, y: 30, size: 8, font, color: rgb(0.4, 0.4, 0.4) });

writeFileSync('docs/Abhed_Deployment_Guide.pdf', await doc.save());
console.log('PDF written to docs/Abhed_Deployment_Guide.pdf');
