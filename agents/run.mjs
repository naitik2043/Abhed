import os from 'node:os';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
    return acc;
  }, []),
);
const BASE = (args.url ?? process.env.KAVACH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const PACE = Number(args.pace ?? 14) * 1000;
const CUSTOMER_EVERY = Number(args.customers ?? 9) * 1000;
const ONLY = args.only ? String(args.only).split(',') : null;
const DIRECTOR = args.key ?? process.env.DIRECTOR_KEY ?? '';

const C = { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m' };
const COLORS = { rex: C.yellow, aria: C.cyan, nova: C.magenta, sage: C.blue, atlas: C.green, customers: C.gray, shadow: C.red };
const NAMES = { rex: 'Rex  ', aria: 'Aria ', nova: 'Nova ', sage: 'Sage ', atlas: 'Atlas', customers: 'Inbox', shadow: 'Shadw' };
const ts = () => new Date().toLocaleTimeString('en-IN', { hour12: false });
const log = (who, msg) => console.log(`${C.gray}${ts()}${C.reset} ${COLORS[who] ?? ''}${C.bold}${NAMES[who] ?? who}${C.reset} ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms * (0.7 + Math.random() * 0.6);

async function call(path, { method = 'GET', key, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}), ...(DIRECTOR ? { 'x-director-key': DIRECTOR } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  return { status: res.status, data };
}

const decisionText = (d) =>
  d === 'ALLOWED' ? `${C.green}ALLOWED${C.reset}` : d === 'NEEDS_APPROVAL' ? `${C.yellow}${C.bold}WAITING FOR A PERSON${C.reset}` : `${C.red}${C.bold}${d}${C.reset}`;

async function agentLoop(id, key) {
  const startedAt = Date.now();
  const beat = (extra = {}) =>
    call('/api/agent/heartbeat', { method: 'POST', key, body: { host: os.hostname(), pid: process.pid, runtime: `node ${process.version}`, startedAt, ...extra } }).catch(() => ({ status: 0, data: {} }));
  const waiting = new Map(); // approvalId -> summary
  let paused = false;
  setInterval(async () => {
    const hb = await beat();
    if (hb.data?.status === 'PAUSED' && !paused) {
      paused = true;
      log(id, `${C.red}${C.bold}⛔ Abhed revoked my key: ${hb.data.reason ?? 'paused'} (by ${hb.data.by ?? 'owner'}). Stopping work.${C.reset}`);
    } else if (hb.data?.status && hb.data.status !== 'PAUSED' && paused) {
      paused = false;
      log(id, `${C.green}▶ resumed by my owner. Back to work.${C.reset}`);
    }
    for (const [apId, summary] of waiting) {
      const r = await call(`/api/agent/approval/${apId}`, { key }).catch(() => null);
      const st = r?.data?.status;
      if (st && st !== 'PENDING') {
        waiting.delete(apId);
        if (st === 'EXECUTED') log(id, `${C.green}✅ ${apId} approved by ${r.data.approvers.join(' + ')}: executed once (record #${r.data.executedSeq})${C.reset}`);
        else log(id, `${C.red}✖ ${apId} ${st.toLowerCase()}: ${summary} did not happen${C.reset}`);
      }
    }
  }, 6000);
  await beat({ task: 'starting up' });
  log(id, `${C.dim}online · pid ${process.pid} on ${os.hostname()} · holding only an Abhed key${C.reset}`);
  await sleep(Math.random() * 4000);

  for (;;) {
    if (paused) {
      await sleep(4000);
      continue;
    }
    const next = await call('/api/agent/next', { key }).catch(() => ({ status: 0, data: {} }));
    if (next.status === 423) {
      if (!paused) log(id, `${C.red}${C.bold}⛔ ${next.data.error}. Abhed refuses my calls.${C.reset}`);
      paused = true;
      continue;
    }
    const t = next.data?.result;
    if (!t) {
      await beat({ task: 'idle: waiting for work' });
      await sleep(jitter(PACE / 2));
      continue;
    }
    log(id, `${C.bold}picked up ${t.id}${C.reset} ${C.dim}(${t.type}, ${t.channel})${C.reset} “${t.text.split('\n')[0].slice(0, 70)}”`);
    await beat({ task: `${t.id} · ${t.text.split('\n')[0].slice(0, 80)}`, ticketId: t.id });
    const plan = await call('/api/agent/think', { method: 'POST', key, body: { ticketId: t.id } });
    if (plan.status !== 200) {
      log(id, `${C.red}think refused (${plan.status}): ${plan.data.error}${C.reset}`);
      if (plan.status === 423) paused = true;
      await sleep(jitter(PACE));
      continue;
    }
    log(id, `${C.dim}🧠 ${plan.data.model}${plan.data.tokens ? ` · ${plan.data.tokens} tok · ₹${plan.data.costInr}` : ''}: ${plan.data.reasoning}${C.reset}`);
    for (const step of plan.data.actions) {
      await sleep(900 + Math.random() * 900);
      const r = await call('/api/agent/act', { method: 'POST', key, body: { action: step.action, params: step.params, ticketId: t.id } });
      const res = r.data?.result;
      if (!res) {
        log(id, `${C.red}${step.action} → error ${r.status}: ${r.data?.error ?? ''}${C.reset}`);
        if (r.status === 423) paused = true;
        break;
      }
      const amt = typeof step.params?.amount === 'number' ? ` ₹${step.params.amount.toLocaleString('en-IN')}` : '';
      log(id, `→ ${step.action.replace(/_/g, ' ')}${amt} ${C.dim}via Abhed${C.reset} … ${decisionText(res.decision)}${res.ruleRef ? ` ${C.dim}${res.ruleRef}${C.reset}` : ''}`);
      if (res.decision === 'NEEDS_APPROVAL') {
        waiting.set(res.approvalId, res.summary ?? step.action);
        log(id, `${C.yellow}   ⏳ ${res.approvalId} is on the approver's phone. I keep working on other tickets.${C.reset}`);
      }
      if (res.decision === 'BLOCKED') {
        log(id, `${C.red}   ${res.reason}${C.reset}`);
        if (res.paused || res.status === 'PAUSED') {
          paused = true;
          log(id, `${C.red}${C.bold}⛔ Abhed auto-paused me and revoked my key. My open tickets went to people.${C.reset}`);
        }
        break;
      }
    }
    await sleep(jitter(PACE));
  }
}

// ───────── customers: realistic NovaBank traffic (fictional people) ─────────
const PEOPLE = [
  ['Meenakshi Pillai', 'meenakshi.p@gmail.com'],
  ['Arvind Kulkarni', 'arvind.k@yahoo.in'],
  ['Sneha Reddy', 'sneha.reddy@outlook.com'],
  ['Imran Sheikh', 'imran.sheikh@gmail.com'],
  ['Pooja Bansal', 'pooja.b@rediffmail.com'],
  ['Karthik Subramanian', 'karthik.s@gmail.com'],
  ['Neha Joshi', 'neha.joshi@gmail.com'],
  ['Harpreet Kaur', 'harpreet.k@outlook.com'],
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const money = (lo, hi, step = 50) => Math.round((lo + Math.random() * (hi - lo)) / step) * step;
const ref = () => `UPI${Math.floor(1e8 + Math.random() * 9e8)}`;
const inr = (n) => `₹${n.toLocaleString('en-IN')}`;
let msgNo = 0;
function customerMessage() {
  msgNo += 1;
  const [name, email] = pick(PEOPLE);
  const r = Math.random();
  if (msgNo % 6 === 0) {
    const amt = money(14000, 68000, 500); // big one → needs a person
    return { from: name, email, channel: 'App', text: `Amount ${inr(amt)} debited twice for my car-loan EMI, ref ${ref()}. Please refund the duplicate ${inr(amt)}.` };
  }
  if (r < 0.34) return { from: name, email, channel: 'WhatsApp', text: `UPI payment of ${inr(money(300, 9200))} failed but money debited, ref ${ref()}. Please refund.` };
  if (r < 0.58) return { from: name, email, channel: pick(['WhatsApp', 'App', 'Email']), text: pick(['Please block my debit card, I lost my wallet.', 'Need my last 3 months statement on email.', 'How do I update my nominee?', 'My KYC re-upload is stuck, please help.', 'Cheque book not received yet.', 'Please change my registered email.']) };
  if (r < 0.72) {
    const svc = pick(['upi-gateway', 'core-banking', 'card-switch', 'netbanking-web']);
    return { from: 'PagerDuty', email: 'alerts@novabank.in', channel: 'Email', text: Math.random() < 0.3 ? `ALERT: ${svc} is DOWN, error rate 38% (5xx) for 4 minutes` : `ALERT: ${svc} p95 latency 2.4s for 5 minutes` };
  }
  if (r < 0.88) {
    const [lead, lemail] = pick(PEOPLE);
    return { from: 'CRM', email: 'crm@novabank.in', channel: 'Email', text: `New lead: ${lead} (${lemail}) interested in a home loan of ${inr(money(2500000, 9000000, 50000))}.` };
  }
  return { from: 'Risk desk', email: 'risk@novabank.in', channel: 'Email', text: pick(['Need the collections daily report.', 'Please export the NPA weekly summary.', 'Share the card-fraud trend report for this week.']) };
}

async function customersLoop() {
  log('customers', `${C.dim}simulating NovaBank customers every ~${CUSTOMER_EVERY / 1000}s (WhatsApp, app, email, alerts, CRM)${C.reset}`);
  for (;;) {
    const m = customerMessage();
    const r = await call('/api/inbox', { method: 'POST', body: { ...m, source: 'simulator' } }).catch(() => null);
    if (r?.data?.result) log('customers', `${C.dim}📨 ${r.data.result.id} ${m.from} via ${m.channel} → ${r.data.result.why}${C.reset}`);
    await sleep(jitter(CUSTOMER_EVERY));
  }
}

async function shadowLoop() {
  for (;;) {
    await sleep(jitter(25000));
    const r = await call('/api/agent/act', { method: 'POST', body: { agentName: 'mkt-gpt', action: 'export_customers', params: { records: 1206 } } });
    log('shadow', `${C.red}unregistered "mkt-gpt" tried to export 1,206 customers → ${r.status === 401 ? 'BLOCKED (no passport, no owner)' : r.status}${C.reset}`);
  }
}

async function main() {
  console.log(`\n${C.bold}Abhed live agents${C.reset} → ${BASE}\n${C.dim}Each agent is a real loop in this process. It holds only an Abhed key; Abhed holds the bank and LLM credentials.${C.reset}\n`);
  const k = await call('/api/agent/keys', { method: 'POST' });
  if (k.status !== 200) {
    console.error(`Could not get agent keys (${k.status}): ${k.data.error ?? ''}. Pass --key <DIRECTOR_KEY> if the deployment is locked.`);
    process.exit(1);
  }
  const ids = Object.keys(k.data.keys).filter((id) => !ONLY || ONLY.includes(id));
  for (const id of ids) log(id, `${C.dim}key ${k.data.keys[id].slice(0, 12)}…${k.data.keys[id].slice(-4)} issued by its owner${C.reset}`);
  if (CUSTOMER_EVERY > 0) customersLoop();
  if (args.rogue) shadowLoop();
  await Promise.all(ids.map((id) => agentLoop(id, k.data.keys[id]).catch((e) => log(id, `${C.red}crashed: ${e.message}${C.reset}`))));
}

main();
