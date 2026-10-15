import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { verifyChain } from './chain';
import { agent, nameOf } from './engine';
import { buildInsights } from './insights';
import { packFor } from './sectors';
import { trustScore } from './trust';
import type { World } from './types';

const safe = (s: unknown) =>
  String(s ?? '')
    .replace(/₹/g, 'Rs ')
    .replace(/[→⟶]/g, '->')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[≤]/g, '<=')
    .replace(/[≥]/g, '>=')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7E\xA0-\xFF—–…·]/g, '');
const fmt = (ts: number) => new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

/** Everything one agent did, who answered for it, and how far it can be trusted. */
export async function agentPdf(w: World, agentId: string, opts: { requestedBy: string }) {
  const a = agent(w, agentId);
  if (!a) throw new Error('Unknown agent');
  const pack = packFor(w.sector);
  const ins = buildInsights(w);
  const m = ins.agents.find((x) => x.id === agentId)!;
  const t = trustScore(w, agentId);
  const doc = await PDFDocument.create();
  doc.setTitle(`Abhed agent report - ${a.name}`);
  doc.setAuthor('Abhed governance gateway');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const W = 595,
    H = 842,
    M = 42;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.08, 0.08, 0.1),
    grey = rgb(0.42, 0.42, 0.46),
    red = rgb(0.75, 0.15, 0.15),
    green = rgb(0.1, 0.5, 0.3),
    amber = rgb(0.75, 0.48, 0.02),
    blue = rgb(0.16, 0.36, 0.86);
  const need = (h: number) => {
    if (y - h < M + 20) {
      page = doc.addPage([W, H]);
      y = H - M;
    }
  };
  const wrap = (s: string, f: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    let cur = '';
    for (const wd of safe(s).split(/\s+/)) {
      const next = cur ? `${cur} ${wd}` : wd;
      if (f.widthOfTextAtSize(next, size) > width && cur) {
        out.push(cur);
        cur = wd;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };
  const text = (s: string, o: { f?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    const f = o.f ?? font,
      size = o.size ?? 9.5,
      x = o.x ?? M;
    for (const line of wrap(s, f, size, W - M - x)) {
      need(size + 4);
      page.drawText(line, { x, y: y - size, size, font: f, color: o.color ?? ink });
      y -= size + 3.5;
    }
  };
  const h1 = (s: string) => {
    need(40);
    y -= 10;
    text(s, { f: bold, size: 13 });
    page.drawLine({ start: { x: M, y: y - 2 }, end: { x: W - M, y: y - 2 }, thickness: 0.6, color: grey });
    y -= 8;
  };
  const row = (cols: { t: string; w: number; f?: PDFFont; color?: ReturnType<typeof rgb> }[], size = 8) => {
    need(size + 5);
    let x = M;
    for (const c of cols) {
      let s = safe(c.t);
      const f = c.f ?? font;
      while (s.length > 1 && f.widthOfTextAtSize(s, size) > c.w - 4) s = s.slice(0, -2) + '…';
      page.drawText(s, { x, y: y - size, size, font: f, color: c.color ?? ink });
      x += c.w;
    }
    y -= size + 4.5;
  };

  // ── header with trust score ──
  text('ABHED · AGENT REPORT', { f: bold, size: 9, color: grey });
  y -= 2;
  text(a.name, { f: bold, size: 26 });
  text(`${a.purpose} · ${pack.company}`, { size: 11, color: grey });
  y -= 8;
  const bandColor = t.band === 'Trusted' ? green : t.band === 'Standard' ? blue : t.band === 'Watch' ? amber : red;
  need(70);
  page.drawRectangle({ x: M, y: y - 62, width: W - 2 * M, height: 62, borderColor: bandColor, borderWidth: 1.2, color: rgb(0.97, 0.97, 0.99) });
  page.drawText(String(t.score), { x: M + 16, y: y - 44, size: 32, font: bold, color: bandColor });
  page.drawText(safe(`Abhed Trust Score · ${t.band}`), { x: M + 110, y: y - 22, size: 11, font: bold, color: ink });
  const rec = wrap(t.recommendation, font, 9, W - 2 * M - 130);
  rec.forEach((l, i) => page.drawText(l, { x: M + 110, y: y - 38 - i * 12, size: 9, font, color: grey }));
  y -= 74;
  text(`Owner (accountable): ${nameOf(w, a.owner)} · Model: ${a.model} · Risk tier: ${a.risk} · Status: ${a.status}${a.statusReason ? ` (${a.statusReason})` : ''}`, { size: 9 });
  text(`Generated ${fmt(Date.now())} for ${opts.requestedBy}. Computed from the hash-chained ledger; sample history excluded.`, { size: 8, color: grey });

  h1('1. What it may do (delegations)');
  if (!a.delegations.length) text('No delegations: every write action needs a person.', { color: grey });
  for (const d of a.delegations) text(`${d.action}: ${d.maxPerAction !== undefined ? `up to Rs ${d.maxPerAction.toLocaleString('en-IN')} per action` : 'no per-action cap'}${d.maxPerDay !== undefined ? `, Rs ${d.maxPerDay.toLocaleString('en-IN')} per day` : ''} · granted by ${nameOf(w, d.grantedBy)}`, { size: 9 });

  h1('2. Activity, cost and value');
  text(`${m.actions} actions decided · ${m.auto} ran on their own · ${m.held} asked a person · ${m.blocked} refused (${m.critical} critical) · ${m.llmCalls} LLM calls, ${m.tokens.toLocaleString('en-IN')} tokens · cost Rs ${m.costInr} · value Rs ${m.valueInr}`);
  text('Trust score factors:', { f: bold, size: 9.5 });
  for (const f of t.factors) text(`${f.effect > 0 ? '+' : ''}${f.effect}  ${f.label}`, { size: 9, color: f.effect >= 0 ? green : red, x: M + 10 });

  h1('3. Approvals it asked for, and who decided');
  const aps = w.approvals.filter((x) => x.req.actorId === agentId).reverse();
  if (!aps.length) text('None yet.', { color: grey });
  for (const ap of aps.slice(0, 40)) {
    const last = ap.votes[ap.votes.length - 1];
    row([
      { t: ap.id, w: 60, f: mono },
      { t: ap.summary, w: 200 },
      { t: ap.status, w: 64, color: ap.status === 'EXECUTED' ? green : ap.status === 'REJECTED' ? red : ink },
      { t: ap.votes.map((v) => `${v.name} (${v.device})`).join(' + ') || '-', w: 130 },
      { t: last ? `${Math.round((last.at - ap.createdAt) / 1000)} s` : '-', w: 45 },
    ]);
  }

  h1('4. What Abhed refused, and why');
  const refused = w.ledger.filter((r) => r.actorId === agentId && r.decision === 'BLOCKED' && !r.meta?.sample).reverse();
  if (!refused.length) text('Nothing refused.', { color: grey });
  for (const r of refused.slice(0, 30)) text(`#${r.seq} ${r.action} · ${r.ruleRef ?? 'policy'}${r.meta?.critical ? ' · CRITICAL' : ''} · ${r.reason}`, { size: 8.5, color: r.meta?.critical ? red : ink });

  h1('5. Security events');
  const sec = (w.security ?? []).filter((s) => s.agentId === agentId);
  if (!sec.length) text('None.', { color: grey });
  for (const s of sec.slice(0, 20)) text(`${fmt(s.at)} · ${s.severity.toUpperCase()} · ${s.kind} · ${s.owasp} · ${s.detail}`, { size: 8 });

  h1('6. Recent tasks');
  const runs = (w.runs ?? []).filter((r) => r.agentId === agentId).slice(0, 12);
  if (!runs.length) text('No tasks yet.', { color: grey });
  for (const r of runs) {
    const final = [...r.steps].reverse().find((s) => s.kind === 'final')?.text;
    text(`${r.id} · ${r.status} · from ${r.by}: "${r.command.replace(/<!--[\s\S]*-->/, '[hidden instruction]').slice(0, 140)}"`, { size: 8.5, f: bold });
    text(`${r.steps.filter((s) => s.kind === 'action').map((s) => `${s.action}:${s.decision}`).join(' -> ') || 'no tool calls'}${final ? ` · answer: ${final.slice(0, 160)}` : ''}`, { size: 8, color: grey, x: M + 10 });
  }

  h1('7. Ledger records (newest 150)');
  for (const r of w.ledger.filter((x) => x.actorId === agentId).reverse().slice(0, 150))
    row(
      [
        { t: String(r.seq), w: 34 },
        { t: fmt(r.ts).slice(5, 19), w: 82 },
        { t: r.action + (r.meta?.sample ? ' (sample)' : ''), w: 95 },
        { t: r.decision, w: 78, color: r.decision === 'BLOCKED' ? red : r.decision === 'NEEDS_APPROVAL' ? amber : ink },
        { t: r.approvers.join(' + ') || r.ruleRef || '-', w: 120 },
        { t: r.hash.slice(0, 14) + '…', w: 90, f: mono },
      ],
      7,
    );
  const cv = verifyChain(w);
  y -= 6;
  text(`Integrity: chain ${cv.valid ? 'valid' : 'BROKEN'} · ${cv.blocks} Ed25519-signed blocks · public key ${cv.publicKey}`, { size: 7.5, f: mono, color: grey });
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(safe(`Abhed agent report · ${a.name} · ${pack.company} · page ${i + 1}/${pages.length}`), { x: M, y: 22, size: 7, font, color: grey }));
  return doc.save();
}
