import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { activeRules, nameOf } from './engine';
import { complianceEvidence } from './compliance';
import { buildInsights } from './insights';
import { trustScore } from './trust';
import { packFor } from './sectors';
import type { World } from './types';

/** Standard PDF fonts are WinAnsi only: map the few non-Latin glyphs we use, drop the rest. */
const safe = (s: unknown) =>
  String(s ?? '')
    .replace(/₹/g, 'Rs ')
    .replace(/[→⟶]/g, '->')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[≤]/g, '<=')
    .replace(/[≥]/g, '>=')
    .replace(/×/g, 'x')
    .replace(/[⚠✓✕•]/g, '')
    .replace(/[^\x20-\x7E\xA0-\xFF—–…·]/g, '');

const fmtTime = (ts: number) => new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

export async function auditPdf(w: World, opts: { requestedBy: string }) {
  const pack = packFor(w.sector);
  const ins = buildInsights(w);
  const doc = await PDFDocument.create();
  doc.setTitle(`Abhed audit report - ${pack.company}`);
  doc.setAuthor('Abhed governance gateway');
  doc.setCreationDate(new Date());
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const W = 595,
    H = 842,
    M = 42;
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const ink = rgb(0.08, 0.08, 0.1);
  const grey = rgb(0.42, 0.42, 0.46);
  const red = rgb(0.75, 0.15, 0.15);
  const green = rgb(0.1, 0.5, 0.3);

  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const need = (h: number) => {
    if (y - h < M + 20) newPage();
  };
  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const words = safe(text).split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const wd of words) {
      const next = cur ? `${cur} ${wd}` : wd;
      if (f.widthOfTextAtSize(next, size) > width && cur) {
        lines.push(cur);
        cur = wd;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const text = (t: string, o: { f?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) => {
    const f = o.f ?? font,
      size = o.size ?? 9.5,
      x = o.x ?? M;
    for (const line of wrap(t, f, size, o.width ?? W - M - x)) {
      need(size + 4);
      page.drawText(line, { x, y: y - size, size, font: f, color: o.color ?? ink });
      y -= size + (o.gap ?? 3.5);
    }
  };
  const h1 = (t: string) => {
    need(40);
    y -= 10;
    text(t, { f: bold, size: 14 });
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

  // ───── cover ─────
  text('ABHED · AI AGENT GOVERNANCE', { f: bold, size: 9, color: grey });
  y -= 4;
  text('Audit report', { f: bold, size: 24 });
  text(`${pack.company} · ${pack.label}`, { size: 12, color: grey });
  y -= 6;
  text(`Generated ${fmtTime(Date.now())} for ${opts.requestedBy}. Every figure below is computed from the hash-chained ledger and approval records at that moment. ${ins.sampleExcluded ? `${ins.sampleExcluded} seeded sample records are excluded from the statistics and marked "sample" in the ledger section.` : 'There is no sample data in this ledger.'}`);

  h1('1. Integrity');
  const lv = ins.integrity.ledger,
    cv = ins.integrity.chain;
  text(`Hash chain: ${lv.valid ? `VALID - all ${lv.checked} records re-hashed and linked.` : `BROKEN at record #${lv.firstBadSeq}.`}`, { color: lv.valid ? green : red, f: bold });
  text(`Signed blocks: ${cv.valid ? `VALID - ${cv.blocks} Ed25519-signed blocks seal records #1-#${cv.sealedRecords} (Merkle roots recomputed from record content).` : `BROKEN at block ${cv.firstBadHeight}: ${cv.reason}`}`, { color: cv.valid ? green : red, f: bold });
  text(`Abhed public key (Ed25519): ${cv.publicKey}`, { f: mono, size: 7.5 });
  for (const b of (w.blocks ?? []).slice(-8)) text(`Block ${b.height}: records #${b.fromSeq}-#${b.toSeq} · root ${b.merkleRoot.slice(0, 16)}… · hash ${b.hash.slice(0, 16)}… · ${b.anchor ? `${b.anchor.service}: ${b.anchor.status}` : 'not anchored yet'}`, { f: mono, size: 7 });

  h1('2. Speed vs control');
  text(`Agent actions decided: ${ins.mix.total} · ran automatically ${ins.mix.auto} (${ins.mix.autoPct ?? 0}%) · held for a person ${ins.mix.held} (${ins.mix.heldPct ?? 0}%) · refused ${ins.mix.blocked}.`);
  text(`Gateway decision time (measured on ${ins.speed.measured} calls): p50 ${ins.speed.p50ms ?? '-'} ms · p95 ${ins.speed.p95ms ?? '-'} ms · p99 ${ins.speed.p99ms ?? '-'} ms.`);
  text(`Human checkpoints: ${ins.human.decided} decided · median wait ${ins.human.medianWaitS ?? '-'} s · p95 ${ins.human.p95WaitS ?? '-'} s · ${ins.human.pending} pending · ${ins.human.rubberStamps} possible rubber-stamps flagged.`);
  y -= 3;
  text('Why people were asked', { f: bold, size: 10 });
  for (const r of ins.reasons.slice(0, 10)) text(`${r.count} × ${r.rule}: ${r.says}`, { size: 8.5 });
  if (ins.blockReasons.length) {
    text('Why actions were refused', { f: bold, size: 10 });
    text(ins.blockReasons.map((b) => `${b.category} ${b.count}`).join(' · '), { size: 8.5 });
  }

  h1('3. Agents: usage, cost, value, risk');
  row(
    [
      { t: 'Agent', w: 70, f: bold },
      { t: 'Owner', w: 90, f: bold },
      { t: 'Status', w: 64, f: bold },
      { t: 'Actions', w: 46, f: bold },
      { t: 'Held', w: 36, f: bold },
      { t: 'Refused', w: 46, f: bold },
      { t: 'LLM tokens', w: 56, f: bold },
      { t: 'Cost Rs', w: 46, f: bold },
      { t: 'Value Rs', w: 50, f: bold },
      { t: 'Risk', w: 40, f: bold },
    ],
    8,
  );
  for (const a of ins.agents)
    row([
      { t: a.name, w: 70 },
      { t: a.owner, w: 90 },
      { t: a.status, w: 64, color: a.status === 'PAUSED' ? red : ink },
      { t: String(a.actions), w: 46 },
      { t: String(a.held), w: 36 },
      { t: String(a.blocked), w: 46 },
      { t: String(a.tokens), w: 56 },
      { t: a.costInr.toFixed(2), w: 46 },
      { t: String(a.valueInr), w: 50 },
      { t: String(a.riskScore), w: 40, color: a.riskScore >= 60 ? red : ink },
    ]);

  h1('3b. Abhed Trust Score (earned autonomy)');
  for (const a of w.agents) {
    const t = trustScore(w, a.id);
    text(`${a.name}: ${t.score} · ${t.band} · ${t.recommendation}`, { size: 8.5, color: t.band === 'High risk' ? red : t.band === 'Trusted' ? green : ink });
  }

  h1('3c. Compliance evidence (live counts)');
  for (const c of complianceEvidence(w)) {
    text(`${c.framework}: ${c.control}`, { f: bold, size: 8.5 });
    text(c.evidence, { size: 8.5, color: grey, x: M + 10 });
  }
  text('Mapping is Abhed\'s reading of each framework, not legal advice.', { size: 7.5, color: grey });

  h1('4. Accountability chain (high-impact actions that ran)');
  if (!ins.chains.length) text('No high-impact action has been approved and executed yet.', { color: grey });
  for (const c of ins.chains) {
    text(`${c.approvalId} · ${c.summary}`, { f: bold, size: 9 });
    text(
      `Agent ${c.agent} (owner ${c.owner ?? '-'}) -> rule ${c.rule} -> approved by ${c.approvers.map((a) => `${a.name} on ${a.device} in ${a.seconds}s${a.evidence ? '' : ' without opening evidence'}`).join(' + ')} -> executed as ledger #${c.executedSeq} (${c.recordHash?.slice(0, 16)}…)${c.block ? ` -> sealed in block ${c.block.height}${c.block.anchor ? `, anchor ${c.block.anchor}` : ''}` : ' -> not sealed yet'}`,
      { size: 8.5, x: M + 10 },
    );
  }

  h1('5. Approvals');
  for (const a of [...w.approvals].reverse().slice(0, 60)) {
    const last = a.votes[a.votes.length - 1];
    row([
      { t: a.id, w: 62, f: mono },
      { t: a.summary, w: 230 },
      { t: a.status, w: 70, color: a.status === 'REJECTED' ? red : a.status === 'EXECUTED' ? green : ink },
      { t: a.votes.map((v) => v.name).join(' + ') || '-', w: 100 },
      { t: last ? `${Math.round((last.at - a.createdAt) / 1000)} s` : '-', w: 50 },
    ]);
  }

  h1('6. Incidents, pauses and security events');
  for (const i of w.incidents.slice(0, 20)) text(`${i.id} · ${i.status} · ${i.title}`, { size: 8.5 });
  for (const a of w.agents.filter((x) => x.status !== 'ACTIVE')) text(`${a.name} is ${a.status}: ${a.statusReason ?? ''}`, { size: 8.5, color: red });
  for (const s of ins.security.slice(0, 25)) text(`${fmtTime(s.at)} · ${s.severity.toUpperCase()} · ${s.kind} · ${s.owasp} · ${nameOf(w, s.agentId)}: ${s.detail}`, { size: 8 });

  h1('7. Active rules (deterministic: block wins, then the strictest hold)');
  for (const r of activeRules(w)) text(`${r.id}@${r.version} · ${r.decision}${r.approverRole && r.decision === 'NEEDS_APPROVAL' ? ` (${r.approverRole}${r.twoKey && r.twoKey > 1 ? ' x2' : ''})` : ''} · ${r.says} · author ${nameOf(w, r.author)}, approved by ${r.approvedBy}`, { size: 8 });

  h1('8. Ledger (newest 250 records)');
  row(
    [
      { t: '#', w: 34, f: bold },
      { t: 'Time (UTC)', w: 82, f: bold },
      { t: 'Actor', w: 66, f: bold },
      { t: 'Action', w: 78, f: bold },
      { t: 'Decision', w: 72, f: bold },
      { t: 'Rule', w: 92, f: bold },
      { t: 'Hash', w: 88, f: bold },
    ],
    7.5,
  );
  for (const r of [...w.ledger].reverse().slice(0, 250))
    row(
      [
        { t: String(r.seq), w: 34 },
        { t: fmtTime(r.ts).slice(5, 19), w: 82 },
        { t: r.actorName, w: 66 },
        { t: r.action + (r.meta?.sample ? ' (sample)' : ''), w: 78 },
        { t: r.decision, w: 72, color: r.decision === 'BLOCKED' ? red : r.decision === 'NEEDS_APPROVAL' ? rgb(0.7, 0.45, 0) : ink },
        { t: r.ruleRef ?? '-', w: 92 },
        { t: r.hash.slice(0, 14) + '…', w: 88, f: mono },
      ],
      7,
    );

  const pages = doc.getPages();
  pages.forEach((p, i) =>
    p.drawText(safe(`Abhed audit · ${pack.company} · ledger head ${w.ledger[w.ledger.length - 1]?.hash.slice(0, 16) ?? '-'} · page ${i + 1}/${pages.length}`), { x: M, y: 22, size: 7, font, color: grey }),
  );
  return doc.save();
}
