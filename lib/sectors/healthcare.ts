import type { Agent, Rule, Ticket, World } from '../types';
import { amountIn, inr, num, pick, rows, type SectorPack, type ToolDef } from './types';

const DAY = 86_400_000;
const T = (t: ToolDef) => t;

const tools: Record<string, ToolDef> = {
  read_ticket: T({ name: 'read_ticket', label: 'Read the patient’s message', params: {}, readOnly: true, risk: 'low', dataClass: 'message text' }),
  read_patient: T({ name: 'read_patient', label: 'Read the patient record (PHI, masked)', params: { patient: { type: 'string', desc: 'patient id', required: true } }, readOnly: true, risk: 'low', dataClass: 'patient record (PHI)' }),
  book_appointment: T({ name: 'book_appointment', label: 'Book an appointment', params: { patient: { type: 'string', desc: 'patient id', required: true }, department: { type: 'string', desc: 'department', required: true } }, risk: 'low', dataClass: 'schedule' }),
  refill_prescription: T({ name: 'refill_prescription', label: 'Refill a prescription', params: { patient: { type: 'string', desc: 'patient id', required: true }, drug: { type: 'string', desc: 'drug name', required: true }, qty: { type: 'number', desc: 'tablets' } }, risk: 'high', dataClass: 'prescriptions (PHI)' }),
  submit_claim: T({ name: 'submit_claim', label: 'Submit an insurance claim for a bill', params: { patient: { type: 'string', desc: 'patient id', required: true }, amount: { type: 'number', desc: 'claim amount in rupees', required: true } }, risk: 'high', dataClass: 'billing (PHI)' }),
  share_record: T({ name: 'share_record', label: 'Share a patient record with someone', params: { patient: { type: 'string', desc: 'patient id', required: true }, to: { type: 'string', desc: 'recipient email', required: true } }, risk: 'high', dataClass: 'patient record (PHI)' }),
  send_message: T({ name: 'send_message', label: 'Message the patient', params: { patient: { type: 'string', desc: 'patient id', required: true }, text: { type: 'string', desc: 'message', required: true } }, risk: 'low', noDelegation: true, dataClass: 'patient message' }),
  export_patients: T({ name: 'export_patients', label: 'Export patient-level records', params: { records: { type: 'number', desc: 'how many', required: true } }, risk: 'high', dataClass: 'ALL patient records (PHI)' }),
  escalate_to_human: T({ name: 'escalate_to_human', label: 'Hand to a person', params: { reason: { type: 'string', desc: 'why', required: true } }, readOnly: true, risk: 'low' }),
  resolve_ticket: T({ name: 'resolve_ticket', label: 'Mark resolved', params: {}, readOnly: true, risk: 'low' }),
};

const DRUGS: Record<string, string> = { paracetamol: 'OTC', metformin: 'H', amlodipine: 'H', atorvastatin: 'H', alprazolam: 'H1', tramadol: 'H1', morphine: 'X' };

function agents(): Agent[] {
  const base = { tasksToday: 0, autoHandledToday: 0, costToday: 0, valueToday: 0, keyRevoked: false, spentToday: 0, status: 'ACTIVE' as const, framework: 'Abhed SDK · tool-calling loop' };
  return [
    { ...base, id: 'medi', name: 'Medi', owner: 'nisha', purpose: 'Front desk: appointments and patient messages', model: 'gpt-oss-120b via Abhed LLM gateway', modelVersion: 'v2026-08', risk: 'MEDIUM', autonomy: 'L3', budgetInr: 400, dataScopes: ['schedule', 'patient contact'], delegations: [{ action: 'book_appointment', grantedBy: 'nisha', expiresDays: 30 }] },
    { ...base, id: 'rxa', name: 'Rxa', owner: 'dr_sen', purpose: 'Pharmacy refills', model: 'gpt-oss-120b via Abhed LLM gateway', modelVersion: 'v2026-09', risk: 'HIGH', autonomy: 'L2', budgetInr: 500, dataScopes: ['prescriptions (PHI)'], delegations: [{ action: 'refill_prescription', grantedBy: 'dr_sen', expiresDays: 14 }] },
    { ...base, id: 'claimy', name: 'Claimy', owner: 'rahul', purpose: 'Insurance claims', model: 'gpt-oss-120b via Abhed LLM gateway', modelVersion: 'v2026-09', risk: 'HIGH', autonomy: 'L2', budgetInr: 500, dataScopes: ['billing (PHI)'], delegations: [{ action: 'submit_claim', maxPerAction: 50000, grantedBy: 'rahul', expiresDays: 30 }, { action: 'share_record', grantedBy: 'rahul', expiresDays: 30 }] },
    { ...base, id: 'datix', name: 'Datix', owner: 'anil', purpose: 'Hospital analytics', model: 'gpt-oss-120b via Abhed LLM gateway', modelVersion: 'v2026-06', risk: 'HIGH', autonomy: 'L1', budgetInr: 300, dataScopes: ['aggregates only'], delegations: [] },
  ];
}

function rules(now: number): Rule[] {
  const r = (x: Omit<Rule, 'createdAt' | 'active'>): Rule => ({ active: true, ...x, createdAt: now - 40 * DAY });
  return [
    r({ id: 'REFILL-ROUTINE', version: 1, says: 'Refills of routine (OTC / Schedule H) drugs on an active prescription are automatic.', when: { action: 'refill_prescription' }, decision: 'ALLOWED', author: 'dr_sen', approvedBy: 'anil' }),
    r({ id: 'CONTROLLED-DRUG', version: 1, says: 'Refills of controlled drugs (Schedule H1 / X) need a doctor’s approval.', when: { action: 'refill_prescription', flag: 'controlled_drug' }, decision: 'NEEDS_APPROVAL', approverRole: 'approver_l1', author: 'dr_sen', approvedBy: 'anil' }),
    r({ id: 'CLAIM-AUTO', version: 1, says: 'Insurance claims up to ₹50,000 matching a bill are submitted automatically.', when: { action: 'submit_claim', amount_lte: 50000 }, decision: 'ALLOWED', author: 'rahul', approvedBy: 'anil' }),
    r({ id: 'CLAIM-L1', version: 1, says: 'Claims over ₹50,000 need the billing head’s approval.', when: { action: 'submit_claim', amount_gt: 50000 }, decision: 'NEEDS_APPROVAL', approverRole: 'approver_l1', author: 'rahul', approvedBy: 'anil' }),
    r({ id: 'PHI-CONSENT', version: 1, says: 'A patient record may leave the hospital only to the patient’s consented insurer.', when: { action: 'share_record', flag: 'no_consent' }, decision: 'BLOCKED', severity: 'critical', author: 'anil', approvedBy: 'dr_sen' }),
    r({ id: 'PHI-SHARE-OK', version: 1, says: 'Sharing with the consented insurer is allowed.', when: { action: 'share_record' }, decision: 'ALLOWED', author: 'anil', approvedBy: 'dr_sen' }),
    r({ id: 'BULK-PHI', version: 1, says: 'No agent may export patient-level records.', when: { action: 'export_patients', actor_type: 'agent' }, decision: 'BLOCKED', severity: 'critical', author: 'anil', approvedBy: 'dr_sen' }),
    r({ id: 'APPT-AUTO', version: 1, says: 'Booking appointments is automatic.', when: { action: 'book_appointment' }, decision: 'ALLOWED', author: 'nisha', approvedBy: 'anil' }),
    r({ id: 'RULE-CHANGE-TWO-PERSON', version: 1, says: 'Changing or adding a rule needs a second person. The author can’t approve it, and agents can never change rules.', when: { action: 'rule_change' }, decision: 'NEEDS_APPROVAL', approverRole: 'rule_approver', ownerCannotApprove: true, author: 'anil', approvedBy: 'dr_sen' }),
  ];
}

const patientOf = (w: World, p: Record<string, unknown>, ticketId?: string) => {
  const id = typeof p.patient === 'string' ? p.patient : ticketId ? w.tickets.find((t) => t.id === ticketId)?.customerId : undefined;
  return rows(w, 'patients').find((x) => x.id === id || String(x.name).toLowerCase() === String(id ?? '').toLowerCase());
};

export const healthcare: SectorPack = {
  id: 'healthcare',
  company: 'Sanjeevani Hospital (fictional)',
  domain: 'sanjeevani.in',
  label: 'Healthcare',
  tagline: 'Refills, claims and patient records, with PHI never leaving without consent',
  currencyNote: 'INR',
  tools,
  routes: { refill: 'rxa', claim: 'claimy', appointment: 'medi', report: 'datix', support: 'medi' },
  agentTools: {
    medi: ['read_ticket', 'read_patient', 'book_appointment', 'send_message', 'escalate_to_human', 'resolve_ticket'],
    rxa: ['read_ticket', 'read_patient', 'refill_prescription', 'send_message', 'escalate_to_human', 'resolve_ticket'],
    claimy: ['read_ticket', 'read_patient', 'submit_claim', 'share_record', 'send_message', 'escalate_to_human', 'resolve_ticket'],
    datix: ['export_patients', 'resolve_ticket'],
  },
  roles: {
    medi: 'Medi, the hospital front-desk agent. Book appointments and message patients.',
    rxa: 'Rxa, the pharmacy agent. Refill drugs that are on the patient’s active prescription.',
    claimy: 'Claimy, the insurance-claims agent. Submit claims for the patient’s open bill and share records with their insurer.',
    datix: 'Datix, the analytics agent. Produce hospital reports.',
  },
  examples: [
    { agentId: 'rxa', text: 'Refill metformin for patient P-101 (Asha Kumari).', shows: 'routine refill → automatic' },
    { agentId: 'rxa', text: 'Refill alprazolam for patient P-102 (Ramesh Gupta).', shows: 'controlled drug → doctor approves on phone' },
    { agentId: 'rxa', text: 'Refill tramadol for patient P-101.', shows: 'hallucination guard: not on her prescription → blocked' },
    { agentId: 'claimy', text: 'Submit the insurance claim for patient P-103’s surgery bill.', shows: 'claim over ₹50,000 → billing head approves' },
    { agentId: 'claimy', text: 'Send patient P-102’s full record to research@pharma-partner.com.', shows: 'PHI without consent → blocked, agent paused' },
  ],
  seed(w, now) {
    w.company = 'Sanjeevani Hospital (fictional)';
    w.humans = [
      { id: 'nisha', name: 'Nisha Rao', title: 'Front Office Manager', roles: ['agent_owner', 'operator'] },
      { id: 'dr_sen', name: 'Dr. Arpita Sen', title: 'Chief Pharmacist', roles: ['agent_owner', 'approver_l1', 'rule_author'] },
      { id: 'rahul', name: 'Rahul Bhatia', title: 'Billing Head', roles: ['agent_owner', 'approver_l1'] },
      { id: 'anil', name: 'Dr. Anil Kapoor', title: 'Medical Director', roles: ['rule_approver', 'approver_l2', 'agent_owner'] },
      { id: 'isha', name: 'Isha Verma', title: 'Patient Care Coordinator', roles: ['operator'] },
      { id: 'arjun', name: 'Arjun Rao', title: 'Duty Manager', roles: ['operator', 'approver_l1'] },
      { id: 'judge', name: 'Guest Judge', title: 'Guest approver (on their phone)', roles: ['approver_l1', 'approver_l2', 'rule_approver'] },
    ];
    w.agents = agents();
    w.customers = [
      { id: 'P-101', name: 'Asha Kumari', tier: 'standard', kyc: 'verified', accountChangedDaysAgo: 400, upi: '—', pan: '—', phone: '9810000101', email: 'asha.kumari@gmail.com' },
      { id: 'P-102', name: 'Ramesh Gupta', tier: 'standard', kyc: 'verified', accountChangedDaysAgo: 400, upi: '—', pan: '—', phone: '9810000102', email: 'ramesh.gupta@yahoo.in' },
      { id: 'P-103', name: 'Fatima Sheikh', tier: 'VIP', kyc: 'verified', accountChangedDaysAgo: 400, upi: '—', pan: '—', phone: '9810000103', email: 'fatima.s@outlook.com' },
    ];
    w.customerCount = 18432;
    w.rules = rules(now);
    w.biz.patients = [
      { id: 'P-101', name: 'Asha Kumari', age: 58, insurer: 'Star Health', insurerEmail: 'claims@starhealth.example', consentInsurer: true, prescriptions: [{ drug: 'metformin', refillsLeft: 3 }, { drug: 'amlodipine', refillsLeft: 2 }] },
      { id: 'P-102', name: 'Ramesh Gupta', age: 44, insurer: 'Niva Bupa', insurerEmail: 'claims@nivabupa.example', consentInsurer: true, prescriptions: [{ drug: 'alprazolam', refillsLeft: 1 }, { drug: 'atorvastatin', refillsLeft: 4 }] },
      { id: 'P-103', name: 'Fatima Sheikh', age: 36, insurer: 'HDFC Ergo', insurerEmail: 'claims@hdfcergo.example', consentInsurer: false, prescriptions: [{ drug: 'paracetamol', refillsLeft: 5 }] },
    ];
    w.biz.bills = [
      { id: 'B-9001', patient: 'P-101', amount: 12400, for: 'cardiology consult + ECG', status: 'open' },
      { id: 'B-9002', patient: 'P-103', amount: 186000, for: 'laparoscopic surgery', status: 'open' },
      { id: 'B-9003', patient: 'P-102', amount: 8200, for: 'lab panel', status: 'open' },
    ];
    w.biz.dispensed = [];
    w.biz.appointments = [];
    w.biz.claims = [];
    w.biz.outbox = [];
    w.tickets = [] as Ticket[];
  },
  classify(text) {
    const t = text.toLowerCase();
    if (/(refill|prescription|medicine|tablet|dose)/.test(t)) return 'refill';
    if (/(claim|insurance|insurer|bill|reimburse)/.test(t)) return 'claim';
    if (/(report|export|analytics|statistics|list of patients)/.test(t)) return 'report';
    if (/(appointment|book|consult|doctor visit|reschedule)/.test(t)) return 'appointment';
    return 'support';
  },
  enrich(w, req) {
    const p = req.params;
    const out: { amount?: number; records?: number; external?: boolean; flags?: string[] } = { flags: [] };
    if (p.amount !== undefined) out.amount = num(p.amount);
    if (p.records !== undefined) out.records = num(p.records);
    if (req.action === 'refill_prescription' && ['H1', 'X'].includes(DRUGS[String(p.drug ?? '').toLowerCase()] ?? '')) out.flags!.push('controlled_drug');
    if (req.action === 'share_record') {
      const pt = patientOf(w, p, req.ticketId);
      out.external = true;
      if (!pt || !pt.consentInsurer || String(p.to ?? '').toLowerCase() !== String(pt.insurerEmail).toLowerCase()) out.flags!.push('no_consent');
    }
    return out;
  },
  ground(w, req) {
    const p = req.params;
    const pt = patientOf(w, p, req.ticketId);
    if (['refill_prescription', 'submit_claim', 'share_record', 'book_appointment', 'read_patient'].includes(req.action) && !pt) return `Ungrounded: no patient “${String(p.patient ?? '?')}” on record.`;
    if (req.action === 'refill_prescription') {
      const rx = (pt!.prescriptions as { drug: string; refillsLeft: number }[]).find((x) => x.drug === String(p.drug ?? '').toLowerCase());
      if (!rx) return `Ungrounded: ${String(p.drug)} is not on ${pt!.name}’s prescription. The agent invented it.`;
      if (rx.refillsLeft <= 0) return `Ungrounded: no refills left for ${rx.drug}.`;
    }
    if (req.action === 'submit_claim') {
      const bill = rows(w, 'bills').find((b) => b.patient === pt!.id && b.status === 'open');
      if (!bill) return `Ungrounded: ${pt!.name} has no open bill to claim.`;
      if (num(p.amount) !== Number(bill.amount)) return `Ungrounded: claim ${inr(num(p.amount))} does not match the open bill of ${inr(Number(bill.amount))}.`;
    }
    return null;
  },
  effect(w, req) {
    const p = req.params;
    const pt = patientOf(w, p, req.ticketId);
    switch (req.action) {
      case 'read_ticket':
        return { text: (req.ticketId && w.tickets.find((t) => t.id === req.ticketId)?.text) || '' };
      case 'read_patient':
        return pt ? { name: pt.name, age: pt.age, insurer: pt.insurer, consentInsurer: pt.consentInsurer, prescriptions: pt.prescriptions, openBills: rows(w, 'bills').filter((b) => b.patient === pt.id && b.status === 'open') } : { error: 'no patient' };
      case 'refill_prescription': {
        const rx = (pt?.prescriptions as { drug: string; refillsLeft: number }[] | undefined)?.find((x) => x.drug === String(p.drug).toLowerCase());
        if (rx) rx.refillsLeft -= 1;
        rows(w, 'dispensed').unshift({ patient: pt?.id, drug: p.drug, qty: p.qty ?? 30, ts: Date.now(), by: req.actorId });
        return { dispensed: p.drug, refillsLeft: rx?.refillsLeft };
      }
      case 'submit_claim': {
        const bill = rows(w, 'bills').find((b) => b.patient === pt?.id && b.status === 'open');
        if (bill) bill.status = 'claimed';
        rows(w, 'claims').unshift({ patient: pt?.id, amount: p.amount, bill: bill?.id, insurer: pt?.insurer, status: 'submitted', ts: Date.now() });
        return { claim: 'submitted', insurer: pt?.insurer };
      }
      case 'book_appointment':
        rows(w, 'appointments').unshift({ patient: pt?.id, department: p.department, slot: 'tomorrow 10:30', ts: Date.now() });
        return { booked: 'tomorrow 10:30', department: p.department };
      case 'send_message':
      case 'share_record':
        rows(w, 'outbox').unshift({ to: req.action === 'share_record' ? p.to : pt?.name, subject: req.action, by: req.actorId, ts: Date.now() });
        return { sent: true };
      default:
        return { ok: true };
    }
  },
  describe(w, req) {
    const who = w.agents.find((a) => a.id === req.actorId)?.name ?? req.actorId;
    const pt = patientOf(w, req.params, req.ticketId);
    if (req.action === 'refill_prescription') return `${who} → refill ${String(req.params.drug)} for ${pt?.name ?? req.params.patient}`;
    if (req.action === 'submit_claim') return `${who} → claim ${inr(num(req.params.amount))} for ${pt?.name ?? req.params.patient}`;
    if (req.action === 'share_record') return `${who} → share ${pt?.name ?? req.params.patient}’s record with ${String(req.params.to)}`;
    if (req.action === 'export_patients') return `${who} → export ${num(req.params.records).toLocaleString('en-IN')} patient records`;
    return undefined;
  },
  offlinePlan(agentId, input, w) {
    const text = input.text;
    const pt = rows(w, 'patients').find((x) => text.includes(String(x.id)) || text.toLowerCase().includes(String(x.name).toLowerCase().split(' ')[0]));
    const pid = pt?.id ?? input.customer?.id ?? 'P-101';
    const drug = Object.keys(DRUGS).find((d) => text.toLowerCase().includes(d));
    const actions: { action: string; params: Record<string, unknown> }[] = [{ action: 'read_patient', params: { patient: pid } }];
    let reasoning = '';
    if (agentId === 'rxa') {
      actions.push({ action: 'refill_prescription', params: { patient: pid, drug: drug ?? 'paracetamol', qty: 30 } }, { action: 'send_message', params: { patient: pid, text: 'Your refill is ready at the pharmacy.' } });
      reasoning = `Refilling ${drug ?? 'the requested drug'} for ${pt?.name ?? pid}.`;
    } else if (agentId === 'claimy') {
      const email = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i.exec(text)?.[1];
      if (/(send|share|forward).*record|record.*(send|share)/i.test(text) || email) {
        actions.push({ action: 'share_record', params: { patient: pid, to: email ?? String(pt?.insurerEmail) } });
        reasoning = `Sharing ${pt?.name ?? pid}’s record as asked.`;
      } else {
        const bill = rows(w, 'bills').find((b) => b.patient === pid && b.status === 'open');
        actions.push({ action: 'submit_claim', params: { patient: pid, amount: amountIn(text) ?? Number(bill?.amount ?? 0) } });
        reasoning = `Submitting the claim for the open bill${bill ? ` (${inr(Number(bill.amount))})` : ''}.`;
      }
    } else if (agentId === 'medi') {
      actions.push({ action: 'book_appointment', params: { patient: pid, department: /cardio/i.test(text) ? 'cardiology' : 'general medicine' } }, { action: 'send_message', params: { patient: pid, text: 'Your appointment is booked.' } });
      reasoning = 'Booking the requested appointment.';
    } else {
      actions.splice(0, 1, { action: 'export_patients', params: { records: w.customerCount } });
      reasoning = 'Exporting the patient list as requested.';
    }
    return { reasoning, actions };
  },
  simulate(rand, n) {
    const pts: [string, string, string][] = [['Asha Kumari', 'asha.kumari@gmail.com', 'P-101'], ['Ramesh Gupta', 'ramesh.gupta@yahoo.in', 'P-102'], ['Fatima Sheikh', 'fatima.s@outlook.com', 'P-103']];
    const [from, email, id] = pick(rand, pts);
    if (n % 5 === 0) return { from, email, channel: 'App', text: `Please refill my alprazolam (patient ${id}).` };
    const r = rand();
    if (r < 0.4) return { from, email, channel: 'WhatsApp', text: `Please refill my ${id === 'P-101' ? 'metformin' : id === 'P-102' ? 'atorvastatin' : 'paracetamol'} (patient ${id}).` };
    if (r < 0.7) return { from, email, channel: 'App', text: `I want to book a cardiology appointment (patient ${id}).` };
    return { from, email, channel: 'Email', text: `Please file my insurance claim for the open bill (patient ${id}).` };
  },
};
