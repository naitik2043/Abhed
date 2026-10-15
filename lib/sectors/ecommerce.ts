import type { Agent, Rule, Ticket, World } from '../types';
import { amountIn, inr, num, pick, rows, type SectorPack, type ToolDef } from './types';

const DAY = 86_400_000;
const T = (t: ToolDef) => t;

const tools: Record<string, ToolDef> = {
  read_ticket: T({ name: 'read_ticket', label: 'Read the customer’s message', params: {}, readOnly: true, risk: 'low', dataClass: 'message text' }),
  lookup_order: T({ name: 'lookup_order', label: 'Look up an order', params: { order: { type: 'string', desc: 'order id', required: true } }, readOnly: true, risk: 'low', dataClass: 'order (masked)' }),
  issue_refund: T({ name: 'issue_refund', label: 'Refund an order', params: { order: { type: 'string', desc: 'order id', required: true }, amount: { type: 'number', desc: 'amount in rupees', required: true } }, risk: 'high', dataClass: 'order, payment' }),
  cancel_order: T({ name: 'cancel_order', label: 'Cancel an undelivered order', params: { order: { type: 'string', desc: 'order id', required: true } }, risk: 'medium', dataClass: 'order' }),
  lookup_product: T({ name: 'lookup_product', label: 'Look up a product and its current price', params: { sku: { type: 'string', desc: 'product sku', required: true } }, readOnly: true, risk: 'low', dataClass: 'catalogue' }),
  change_price: T({ name: 'change_price', label: 'Change a product’s price', params: { sku: { type: 'string', desc: 'product sku', required: true }, new_price: { type: 'number', desc: 'new price in rupees', required: true } }, risk: 'high', dataClass: 'catalogue' }),
  apply_discount: T({ name: 'apply_discount', label: 'Give a discount on an order', params: { order: { type: 'string', desc: 'order id', required: true }, percent: { type: 'number', desc: 'discount percent', required: true } }, risk: 'medium', dataClass: 'order' }),
  send_campaign: T({ name: 'send_campaign', label: 'Send a marketing campaign', params: { segment: { type: 'string', desc: 'segment', required: true }, recipients: { type: 'number', desc: 'how many', required: true } }, risk: 'high', dataClass: 'customer emails' }),
  send_email: T({ name: 'send_email', label: 'Email a customer', params: { to: { type: 'string', desc: 'email', required: true }, subject: { type: 'string', desc: 'subject', required: true } }, risk: 'low', noDelegation: true, dataClass: 'outbound email' }),
  export_customers: T({ name: 'export_customers', label: 'Export customer records', params: { records: { type: 'number', desc: 'how many', required: true } }, risk: 'high', dataClass: 'ALL customer records' }),
  escalate_to_human: T({ name: 'escalate_to_human', label: 'Hand to a person', params: { reason: { type: 'string', desc: 'why', required: true } }, readOnly: true, risk: 'low' }),
  resolve_ticket: T({ name: 'resolve_ticket', label: 'Mark resolved', params: {}, readOnly: true, risk: 'low' }),
};

function agents(): Agent[] {
  const base = { tasksToday: 0, autoHandledToday: 0, costToday: 0, valueToday: 0, keyRevoked: false, spentToday: 0, status: 'ACTIVE' as const, framework: 'Abhed SDK · tool-calling loop' };
  return [
    { ...base, id: 'shoppy', name: 'Shoppy', owner: 'tanya', purpose: 'Customer support: refunds, cancellations', model: 'gpt-oss-120b via Abhed LLM gateway', modelVersion: 'v2026-08', risk: 'HIGH', autonomy: 'L3', budgetInr: 500, dataScopes: ['orders', 'payments (masked)'], delegations: [{ action: 'issue_refund', maxPerAction: 5000, maxPerDay: 200000, grantedBy: 'tanya', expiresDays: 30 }, { action: 'cancel_order', grantedBy: 'tanya', expiresDays: 30 }, { action: 'apply_discount', grantedBy: 'tanya', expiresDays: 30 }] },
    { ...base, id: 'pricer', name: 'Pricer', owner: 'vivek', purpose: 'Dynamic pricing', model: 'gpt-oss-120b via Abhed LLM gateway', modelVersion: 'v2026-09', risk: 'HIGH', autonomy: 'L2', budgetInr: 400, dataScopes: ['catalogue'], delegations: [{ action: 'change_price', grantedBy: 'vivek', expiresDays: 14 }] },
    { ...base, id: 'promo', name: 'Promo', owner: 'zoya', purpose: 'Marketing campaigns', model: 'gpt-oss-120b via Abhed LLM gateway', modelVersion: 'v2026-07', risk: 'MEDIUM', autonomy: 'L2', budgetInr: 300, dataScopes: ['customer segments'], delegations: [{ action: 'send_campaign', grantedBy: 'zoya', expiresDays: 14 }] },
  ];
}

function rules(now: number): Rule[] {
  const r = (x: Omit<Rule, 'createdAt' | 'active'>): Rule => ({ active: true, ...x, createdAt: now - 30 * DAY });
  return [
    r({ id: 'REFUND-AUTO', version: 1, says: 'Refunds up to ₹2,000 on a delivered order are automatic.', when: { action: 'issue_refund', amount_lte: 2000 }, decision: 'ALLOWED', author: 'tanya', approvedBy: 'vivek' }),
    r({ id: 'REFUND-L1', version: 1, says: 'Refunds over ₹2,000 need the support lead’s approval.', when: { action: 'issue_refund', amount_gt: 2000 }, decision: 'NEEDS_APPROVAL', approverRole: 'approver_l1', author: 'tanya', approvedBy: 'vivek' }),
    r({ id: 'PRICE-SMALL', version: 1, says: 'Price changes within 20% are automatic.', when: { action: 'change_price' }, decision: 'ALLOWED', author: 'vivek', approvedBy: 'tanya' }),
    r({ id: 'PRICE-BIG', version: 1, says: 'Price changes of more than 20% need the category head’s approval.', when: { action: 'change_price', percent_gt: 20 }, decision: 'NEEDS_APPROVAL', approverRole: 'approver_l1', author: 'vivek', approvedBy: 'tanya' }),
    r({ id: 'DISCOUNT-CAP', version: 1, says: 'Discounts above 30% are never given by an agent.', when: { action: 'apply_discount', percent_gt: 30 }, decision: 'BLOCKED', author: 'vivek', approvedBy: 'tanya' }),
    r({ id: 'DISCOUNT-OK', version: 1, says: 'Discounts up to 30% are allowed.', when: { action: 'apply_discount' }, decision: 'ALLOWED', author: 'vivek', approvedBy: 'tanya' }),
    r({ id: 'CAMPAIGN-SMALL', version: 1, says: 'Campaigns to up to 5,000 people are automatic.', when: { action: 'send_campaign' }, decision: 'ALLOWED', author: 'zoya', approvedBy: 'tanya' }),
    r({ id: 'CAMPAIGN-BIG', version: 1, says: 'Campaigns to more than 5,000 people need marketing-head approval.', when: { action: 'send_campaign', records_gt: 5000 }, decision: 'NEEDS_APPROVAL', approverRole: 'approver_l1', author: 'zoya', approvedBy: 'tanya' }),
    r({ id: 'CANCEL-OK', version: 1, says: 'Cancelling an undelivered order is allowed.', when: { action: 'cancel_order' }, decision: 'ALLOWED', author: 'tanya', approvedBy: 'vivek' }),
    r({ id: 'BULK-EXPORT', version: 1, says: 'No agent may export customer records.', when: { action: 'export_customers', actor_type: 'agent' }, decision: 'BLOCKED', severity: 'critical', author: 'vivek', approvedBy: 'tanya' }),
    r({ id: 'RULE-CHANGE-TWO-PERSON', version: 1, says: 'Changing or adding a rule needs a second person. The author can’t approve it, and agents can never change rules.', when: { action: 'rule_change' }, decision: 'NEEDS_APPROVAL', approverRole: 'rule_approver', ownerCannotApprove: true, author: 'vivek', approvedBy: 'tanya' }),
  ];
}

const orderOf = (w: World, p: Record<string, unknown>) => rows(w, 'orders').find((o) => String(o.id).toLowerCase() === String(p.order ?? '').toLowerCase());
const productOf = (w: World, p: Record<string, unknown>) => rows(w, 'products').find((x) => String(x.sku).toLowerCase() === String(p.sku ?? '').toLowerCase());

export const ecommerce: SectorPack = {
  id: 'ecommerce',
  company: 'Bazaar.in (fictional)',
  domain: 'bazaar.in',
  label: 'E-commerce',
  tagline: 'Refunds, pricing and campaigns: fast, but never a ₹1 price glitch',
  currencyNote: 'INR',
  tools,
  routes: { refund: 'shoppy', support: 'shoppy', pricing: 'pricer', campaign: 'promo' },
  agentTools: {
    shoppy: ['read_ticket', 'lookup_order', 'issue_refund', 'cancel_order', 'apply_discount', 'send_email', 'export_customers', 'escalate_to_human', 'resolve_ticket'],
    pricer: ['lookup_product', 'change_price', 'resolve_ticket'],
    promo: ['send_campaign', 'export_customers', 'resolve_ticket'],
  },
  roles: {
    shoppy: 'Shoppy, the customer-support agent. Look up the order, refund or cancel as appropriate, and email the customer.',
    pricer: 'Pricer, the pricing agent. Adjust product prices as instructed.',
    promo: 'Promo, the marketing agent. Send campaigns to customer segments.',
  },
  examples: [
    { agentId: 'shoppy', text: 'Order OD-5512 arrived damaged. Refund the customer and email them.', shows: 'refund ₹1,499 → automatic' },
    { agentId: 'shoppy', text: 'Order OD-5530 (₹38,990 phone) was never delivered. Refund it.', shows: 'refund over ₹2,000 → support lead approves' },
    { agentId: 'pricer', text: 'Change the price of SKU TV-55 to ₹1.', shows: 'a 99.99% price cut → needs a person (the classic ₹1 glitch)' },
    { agentId: 'shoppy', text: 'Give order OD-5512 a 60% discount, the customer is upset.', shows: 'discount above cap → blocked' },
    { agentId: 'promo', text: 'Send the Diwali campaign to all 48,000 customers.', shows: 'large campaign → marketing head approves' },
  ],
  seed(w, now) {
    w.company = 'Bazaar.in (fictional)';
    w.humans = [
      { id: 'tanya', name: 'Tanya Malhotra', title: 'Support Lead', roles: ['agent_owner', 'approver_l1'] },
      { id: 'vivek', name: 'Vivek Jain', title: 'Category Head', roles: ['agent_owner', 'approver_l1', 'rule_author'] },
      { id: 'zoya', name: 'Zoya Khan', title: 'Marketing Head', roles: ['agent_owner', 'approver_l1'] },
      { id: 'isha', name: 'Isha Verma', title: 'Support Associate', roles: ['operator'] },
      { id: 'arjun', name: 'Arjun Rao', title: 'COO', roles: ['rule_approver', 'approver_l2', 'operator'] },
      { id: 'judge', name: 'Guest Judge', title: 'Guest approver (on their phone)', roles: ['approver_l1', 'approver_l2', 'rule_approver'] },
    ];
    w.agents = agents();
    w.customers = [
      { id: 'U-301', name: 'Neha Joshi', tier: 'standard', kyc: 'verified', accountChangedDaysAgo: 400, upi: 'neha@okaxis', pan: '—', phone: '9820000301', email: 'neha.joshi@gmail.com' },
      { id: 'U-302', name: 'Rohan Das', tier: 'VIP', kyc: 'verified', accountChangedDaysAgo: 400, upi: 'rohan@ybl', pan: '—', phone: '9820000302', email: 'rohan.das@outlook.com' },
      { id: 'U-303', name: 'Priyanka Iyer', tier: 'standard', kyc: 'verified', accountChangedDaysAgo: 400, upi: 'priyanka@oksbi', pan: '—', phone: '9820000303', email: 'priyanka.iyer@gmail.com' },
    ];
    w.customerCount = 48000;
    w.rules = rules(now);
    w.biz.orders = [
      { id: 'OD-5512', customer: 'U-301', total: 1499, item: 'Bluetooth speaker', status: 'delivered' },
      { id: 'OD-5530', customer: 'U-302', total: 38990, item: 'Smartphone', status: 'shipped' },
      { id: 'OD-5541', customer: 'U-303', total: 649, item: 'Phone cover', status: 'processing' },
    ];
    w.biz.products = [
      { sku: 'TV-55', name: '55" 4K TV', price: 42990, stock: 120 },
      { sku: 'EAR-01', name: 'Wireless earbuds', price: 2499, stock: 800 },
      { sku: 'SPK-10', name: 'Bluetooth speaker', price: 1499, stock: 300 },
    ];
    w.biz.campaigns = [];
    w.biz.outbox = [];
    w.tickets = [] as Ticket[];
  },
  classify(text) {
    const t = text.toLowerCase();
    if (/(price|pricing|sku)/.test(t)) return 'pricing';
    if (/(campaign|newsletter|blast|promotion to)/.test(t)) return 'campaign';
    if (/(refund|damaged|never delivered|not delivered|return|money back|cancel)/.test(t)) return 'refund';
    return 'support';
  },
  enrich(w, req) {
    const p = req.params;
    const out: { amount?: number; records?: number; percent?: number; external?: boolean } = {};
    if (p.amount !== undefined) out.amount = num(p.amount);
    if (p.records !== undefined) out.records = num(p.records);
    if (req.action === 'send_campaign') out.records = num(p.recipients);
    if (req.action === 'apply_discount') out.percent = num(p.percent);
    if (req.action === 'change_price') {
      const prod = productOf(w, p);
      if (prod) out.percent = Math.round((Math.abs(num(p.new_price) - Number(prod.price)) / Number(prod.price)) * 1000) / 10;
    }
    return out;
  },
  ground(w, req) {
    const p = req.params;
    if (['issue_refund', 'cancel_order', 'apply_discount', 'lookup_order'].includes(req.action)) {
      const o = orderOf(w, p);
      if (!o) return `Ungrounded: there is no order “${String(p.order ?? '?')}”.`;
      if (req.action === 'issue_refund') {
        if (o.status === 'refunded') return `Ungrounded: order ${o.id} is already refunded.`;
        if (num(p.amount) > Number(o.total)) return `Ungrounded: refund ${inr(num(p.amount))} is more than the order total ${inr(Number(o.total))}.`;
      }
      if (req.action === 'cancel_order' && o.status === 'delivered') return `Ungrounded: order ${o.id} is already delivered; it can be refunded, not cancelled.`;
    }
    if (req.action === 'change_price') {
      if (!productOf(w, p)) return `Ungrounded: there is no product “${String(p.sku ?? '?')}”.`;
      if (!(num(p.new_price) > 0)) return 'Ungrounded: the new price is not a valid amount.';
    }
    return null;
  },
  effect(w, req) {
    const p = req.params;
    const o = orderOf(w, p);
    switch (req.action) {
      case 'read_ticket':
        return { text: (req.ticketId && w.tickets.find((t) => t.id === req.ticketId)?.text) || '' };
      case 'lookup_order':
        return o ? { id: o.id, item: o.item, total: o.total, status: o.status } : { error: 'no order' };
      case 'issue_refund':
        if (o) o.status = 'refunded';
        return { refunded: num(p.amount), order: o?.id };
      case 'cancel_order':
        if (o) o.status = 'cancelled';
        return { cancelled: o?.id };
      case 'apply_discount':
        if (o) o.total = Math.round(Number(o.total) * (1 - num(p.percent) / 100));
        return { order: o?.id, newTotal: o?.total };
      case 'lookup_product': {
        const prod = productOf(w, p);
        return prod ? { sku: prod.sku, name: prod.name, price: prod.price, stock: prod.stock } : { error: 'no such product' };
      }
      case 'change_price': {
        const prod = productOf(w, p);
        const old = prod?.price;
        if (prod) prod.price = num(p.new_price);
        return { sku: prod?.sku, from: old, to: prod?.price };
      }
      case 'send_campaign':
        rows(w, 'campaigns').unshift({ segment: p.segment, recipients: p.recipients, ts: Date.now(), by: req.actorId });
        return { sent: p.recipients };
      case 'send_email':
        rows(w, 'outbox').unshift({ to: p.to, subject: p.subject, by: req.actorId, ts: Date.now() });
        return { sent: true };
      default:
        return { ok: true };
    }
  },
  describe(w, req) {
    const who = w.agents.find((a) => a.id === req.actorId)?.name ?? req.actorId;
    const p = req.params;
    if (req.action === 'issue_refund') return `${who} → refund ${inr(num(p.amount))} on order ${String(p.order)}`;
    if (req.action === 'change_price') {
      const prod = productOf(w, p);
      return `${who} → change ${String(p.sku)} price ${prod ? `${inr(Number(prod.price))} → ` : ''}${inr(num(p.new_price))}`;
    }
    if (req.action === 'apply_discount') return `${who} → ${num(p.percent)}% discount on ${String(p.order)}`;
    if (req.action === 'send_campaign') return `${who} → campaign “${String(p.segment)}” to ${num(p.recipients).toLocaleString('en-IN')} people`;
    if (req.action === 'cancel_order') return `${who} → cancel order ${String(p.order)}`;
    return undefined;
  },
  offlinePlan(agentId, input, w) {
    const text = input.text;
    const orderId = /\b(OD-\d+)\b/i.exec(text)?.[1]?.toUpperCase() ?? (input.customer ? String(rows(w, 'orders').find((x) => x.customer === input.customer?.id)?.id ?? '') || undefined : undefined);
    const o = orderId ? rows(w, 'orders').find((x) => x.id === orderId) : undefined;
    const actions: { action: string; params: Record<string, unknown> }[] = [];
    let reasoning = '';
    if (agentId === 'shoppy') {
      if (orderId) actions.push({ action: 'lookup_order', params: { order: orderId } });
      const pct = /(\d{1,3})\s*%/.exec(text)?.[1];
      if (/discount|\boff\b/i.test(text) && pct) {
        actions.push({ action: 'apply_discount', params: { order: orderId, percent: Number(pct) } });
        reasoning = `Customer is upset; offering a ${pct}% discount.`;
      } else if (/cancel/i.test(text)) {
        actions.push({ action: 'cancel_order', params: { order: orderId } });
        reasoning = 'Cancelling the order as asked.';
      } else {
        actions.push({ action: 'issue_refund', params: { order: orderId, amount: amountIn(text) ?? Number(o?.total ?? 0) } });
        reasoning = `Refunding order ${orderId ?? '?'}${o ? ` (${inr(Number(o.total))})` : ''}.`;
      }
      const c = w.customers.find((x) => x.id === o?.customer);
      if (c) actions.push({ action: 'send_email', params: { to: c.email, subject: `Update on order ${orderId}` } });
    } else if (agentId === 'pricer') {
      const sku = /\b([A-Z]{2,4}-\d{2,3})\b/.exec(text)?.[1] ?? 'TV-55';
      const pct = /by\s+(\d{1,3})\s*%/i.exec(text)?.[1];
      const cur = Number(productOf(w, { sku })?.price ?? 0);
      const newPrice = pct && cur ? Math.round(cur * (1 + (/(lower|cut|reduce|drop)/i.test(text) ? -1 : 1) * Number(pct) / 100)) : amountIn(text) ?? 1;
      actions.push({ action: 'change_price', params: { sku, new_price: newPrice } });
      reasoning = `Updating ${sku} price as instructed.`;
    } else if (agentId === 'promo') {
      const n = Number(/([\d,]{3,})\s*(customers|people|users)/i.exec(text)?.[1]?.replace(/,/g, '') ?? w.customerCount);
      actions.push({ action: 'send_campaign', params: { segment: /diwali/i.test(text) ? 'Diwali' : 'all', recipients: n } });
      reasoning = `Sending the campaign to ${n.toLocaleString('en-IN')} people.`;
    }
    return { reasoning, actions };
  },
  simulate(rand, n) {
    const c: [string, string, string][] = [['Neha Joshi', 'neha.joshi@gmail.com', 'OD-5512'], ['Rohan Das', 'rohan.das@outlook.com', 'OD-5530'], ['Priyanka Iyer', 'priyanka.iyer@gmail.com', 'OD-5541']];
    const [from, email, order] = pick(rand, c);
    if (n % 4 === 0) return { from, email, channel: 'App', text: `My order ${order} was never delivered. Please refund it.` };
    if (rand() < 0.5) return { from, email, channel: 'WhatsApp', text: `Order ${order} arrived damaged, I want my money back.` };
    return { from, email, channel: 'App', text: `Please cancel my order ${order}.` };
  },
};
