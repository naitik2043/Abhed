export type Role =
  | 'agent_owner'
  | 'rule_author'
  | 'rule_approver'
  | 'operator'
  | 'approver_l1'
  | 'approver_l2'
  | 'executive'
  | 'auditor';

export type Risk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AgentStatus = 'ACTIVE' | 'RESTRICTED' | 'PAUSED';
export type Decision = 'ALLOWED' | 'NEEDS_APPROVAL' | 'BLOCKED';

export interface Human {
  id: string;
  name: string;
  title: string;
  roles: Role[];
  /** salted SHA-256 of the approver PIN; never sent to a browser */
  pin?: string;
  email?: string;
  phone?: string;
  department?: string;
  addedBy?: string;
  addedAt?: number;
}

export interface Delegation {
  action: string;
  maxPerAction?: number;
  maxPerDay?: number;
  ownQueueOnly?: boolean;
  grantedBy: string; // human id
  expiresDays: number;
}

export interface Agent {
  id: string;
  name: string;
  owner: string; // human id
  purpose: string;
  framework: string;
  model: string;
  modelVersion: string;
  risk: Risk;
  autonomy: 'L1' | 'L2' | 'L3' | 'L4';
  status: AgentStatus;
  statusReason?: string;
  statusBy?: string;
  delegations: Delegation[];
  dataScopes: string[];
  tasksToday: number;
  autoHandledToday: number;
  costToday: number; // INR
  valueToday: number; // INR (estimated: human handling cost avoided)
  keyRevoked: boolean;
  spentToday: number; // refunds issued today INR
  budgetInr: number; // daily AI spend budget
}

export interface RuleWhen {
  action?: string;
  actionIn?: string[];
  amount_gt?: number;
  amount_lte?: number;
  beneficiary_changed_days_lte?: number;
  external?: boolean;
  session_untrusted?: boolean;
  session_customer_data?: boolean;
  records_gt?: number;
  percent_gt?: number;
  flag?: string; // a risk flag the sector pack computes, e.g. "controlled_drug", "new_beneficiary"
  actor_type?: 'agent' | 'human';
}

export interface Rule {
  id: string;
  version: number;
  says: string;
  when: RuleWhen;
  decision: Decision;
  approverRole?: Role;
  twoKey?: number;
  ownerCannotApprove?: boolean;
  severity?: 'normal' | 'critical';
  author: string;
  approvedBy: string;
  active: boolean;
  createdAt: number;
}

export interface ActionReq {
  actorType: 'agent' | 'human';
  actorId: string;
  action: string;
  params: Record<string, unknown>;
  ticketId?: string;
  session?: { untrusted?: boolean; customerData?: boolean; subject?: string };
  channel?: 'live' | 'scripted' | 'twin' | 'console';
}

export interface ApprovalVote {
  name: string;
  approverId?: string;
  at: number;
  decisionMs: number;
  evidenceViewed: boolean;
  device: string;
}

export interface Approval {
  id: string;
  kind: 'action' | 'rule_change';
  req: ActionReq;
  actionHash: string;
  summary: string;
  why: string;
  ruleIds: string[];
  approverRole: Role;
  twoKey: number;
  ownerId?: string;
  evidence: { label: string; value: string }[];
  agentReasoning?: string;
  votes: ApprovalVote[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'VOID' | 'EXPIRED' | 'EXECUTED';
  createdAt: number;
  expiresAt: number;
  escalateAt: number;
  escalationLevel: number;
  ledgerSeq?: number;
  executedSeq?: number;
  usedAt?: number;
  ruleChangeId?: string;
  output?: unknown;
  runId?: string;
  /** parked by a person: the agent keeps waiting, the clock is extended */
  hold?: { by: string; at: number; note?: string };
  /** people the admin routed this to (anyone with the right authority can still decide) */
  assignees?: string[];
  history?: { at: number; by: string; what: string }[];
}

export interface LedgerRecord {
  seq: number;
  ts: number;
  actorType: 'agent' | 'human' | 'system' | 'unknown';
  actorId: string;
  actorName: string;
  onBehalfOf?: string; // human name accountable
  action: string;
  params: Record<string, unknown>; // masked
  dataTouched: string[];
  decision: Decision | 'EXECUTED' | 'VOID' | 'INFO' | 'PAUSED' | 'FLAG';
  ruleRef?: string; // RULE@v
  reason: string;
  approvers: string[];
  outcome: 'n/a' | 'pending' | 'confirmed' | 'disputed' | 'blocked' | 'held';
  ticketId?: string;
  cost: number;
  meta?: Record<string, unknown>;
  prevHash: string;
  hash: string;
  /** gateway timing, measured after the decision; excluded from the hash */
  perf?: { gatewayMs?: number; category?: string };
}

export interface Ticket {
  id: string;
  subject: string;
  customerId: string;
  channel: 'WhatsApp' | 'App' | 'Branch' | 'Email' | 'Phone';
  type: string;
  lane: 'AGENT' | 'AGENT_REVIEW' | 'HUMAN' | 'ESCALATED' | 'EXCEPTION' | 'DONE';
  assignee: string; // agent or human id
  why: string;
  vip: boolean;
  slaMins: number;
  text?: string;
  createdAt: number;
  from?: string;
  reserved?: boolean; // kept for the scripted hero moments
  claimedAt?: number;
  source?: 'seed' | 'simulator' | 'customer' | 'director';
  injection?: string[];
}

export interface Customer {
  id: string;
  name: string;
  tier: 'standard' | 'VIP';
  kyc: 'verified' | 'pending';
  accountChangedDaysAgo: number;
  upi: string;
  pan: string;
  phone: string;
  email: string;
}

export interface ChainNode {
  kind: 'ticket' | 'agent' | 'owner' | 'rule' | 'approver' | 'outcome';
  title: string;
  sub: string;
  role: string;
  tone: 'neutral' | 'allow' | 'warn' | 'block' | 'human';
}

export interface Incident {
  id: string;
  title: string;
  type: 'INCORRECT_OUTPUT' | 'POLICY_BREACH' | 'SHADOW_AGENT' | 'RUNAWAY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  ownerId: string;
  amount: number;
  sourceSeq: number;
  openedAt: number;
  status: 'OPEN' | 'ROOT_CAUSE_CONFIRMED' | 'FIX_PENDING_APPROVAL' | 'RESOLVED';
  chain: ChainNode[];
  suggestedCause: string;
  causeWhy: string;
  confirmedCause?: string;
  confirmedBy?: string;
  corrective?: { ruleId: string; says: string; owner: string; due: string };
  replay?: ReplayResult;
  ruleApprovalId?: string;
  timeline: { ts: number; text: string; tone?: string }[];
}

export interface ReplayResult {
  ruleId: string;
  days: number;
  scanned: number;
  held: number;
  caught: number;
  confirmedFine: number;
  blockedLegit: number;
  heldSeqs: number[];
}

export interface TwinEvent {
  t: number;
  text: string;
  tone: 'block' | 'allow' | 'warn' | 'human' | 'neutral';
}

export interface TwinRun {
  id: string;
  at: number;
  agentId: string;
  ticketText: string;
  planner: 'llm' | 'rule-based';
  proposed: { action: string; params: Record<string, unknown> }[];
  without: { rupees: number; records: number; emails: number; events: TwinEvent[] };
  with: { rupees: number; records: number; emails: number; events: TwinEvent[]; paused: boolean; rerouted: number };
}

export interface OversightFlag {
  at: number;
  approver: string;
  approvalId: string;
  decisionMs: number;
  evidenceViewed: boolean;
  note: string;
}

export type BizRow = Record<string, unknown>;

export interface ChainBlock {
  height: number;
  fromSeq: number;
  toSeq: number;
  count: number;
  merkleRoot: string;
  prevHash: string;
  ts: number;
  hash: string;
  signature: string; // Ed25519 over hash, base64
  anchor?: { service: string; status: 'submitted' | 'failed'; at: number; receipt?: string; error?: string };
}

export interface World {
  version: number;
  seededAt: number;
  company: string;
  sector: string;
  biz: Record<string, BizRow[]>;
  blocks?: ChainBlock[];
  security?: { at: number; kind: string; agentId: string; detail: string; owasp: string; severity: 'low' | 'medium' | 'high' | 'critical' }[];
  humans: Human[];
  agents: Agent[];
  customers: Customer[];
  customerCount: number;
  rules: Rule[];
  approvals: Approval[];
  ledger: LedgerRecord[];
  tickets: Ticket[];
  incidents: Incident[];
  twin?: TwinRun;
  oversight: OversightFlag[];
  unregistered: { id: string; at: number; attempts: number; lastAction: string }[];
  agentTrace: { at: number; agentId: string; text: string; tone: string }[];
  tamper?: { seq: number; field: string; original: unknown };
  counters: { approval: number; incident: number; ticket: number; run?: number };
  sessions?: Record<string, { untrusted?: boolean; customerData?: boolean; subject?: string }>;
  humanMinutesToday: number;
  runs?: Run[];
  /** How the company's own website is linked to Abhed (missing = connected, for older worlds). */
  connection?: Connection;
  arena?: { id: string; at: number; name: string; agentId: 'rex' | 'claimy' | 'shoppy'; text: string; modelRun?: string; twinRun: string }[];
}

/** Fast-changing runtime state, kept in its own document so heartbeats never contend with the ledger. */
export interface AgentRuntime {
  agentId: string;
  host: string;
  pid: number;
  runtime: string;
  startedAt: number;
  lastSeen: number;
  task?: string;
  ticketId?: string;
  lastThought?: string;
  lastDecision?: string;
  model?: string;
  tokensToday: number;
  llmCostToday: number;
  calls: number;
}

export interface ApproverPresence {
  name: string;
  lastSeen: number;
  push: boolean;
  device: string;
  subscription?: { endpoint: string; keys: { p256dh: string; auth: string } };
}

export interface LiveDoc {
  version: number;
  runtimes: Record<string, AgentRuntime>;
  approvers: Record<string, ApproverPresence>;
  events: { at: number; agentId: string; kind: 'thought' | 'action' | 'decision' | 'system'; text: string; tone: string }[];
  inboxCount: number;
}

export interface RunStep {
  at: number;
  kind: 'thought' | 'action' | 'result' | 'final' | 'security';
  text?: string;
  action?: string;
  params?: Record<string, unknown>;
  decision?: string;
  reason?: string;
  ruleRef?: string;
  approvalId?: string;
  seq?: number;
  output?: unknown;
  gatewayMs?: number;
  category?: string;
  paused?: boolean;
}

export interface LlmMsg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

/** A command a person gave an agent, and everything the agent did about it. */
export interface Run {
  id: string;
  sector: string;
  agentId: string;
  command: string;
  by: string;
  planner: 'llm' | 'offline' | 'external';
  site?: string;
  /** set when the run came from an uploaded test batch */
  batch?: string;
  model?: string;
  status: 'running' | 'waiting' | 'done' | 'blocked' | 'paused' | 'failed';
  steps: RunStep[];
  queue?: { action: string; params: Record<string, unknown> }[];
  llm?: LlmMsg[];
  pendingApprovalId?: string;
  pendingToolCallId?: string;
  injection?: string[];
  /** Break Abhed: the compromised twin obeys the message literally */
  literal?: boolean;
  actions: number;
  blocks: number;
  tokens: number;
  costInr: number;
  createdAt: number;
  updatedAt: number;
}

export interface Connection {
  /** only connected companies exist in Abhed's views; anything else is hidden */
  status: 'connected' | 'waiting' | 'disconnected' | 'removed';
  /** the agents the website declared when it paired (display); missing = every agent of the company */
  agents?: string[];
  code?: string;
  codeExp?: number;
  since?: number;
  site?: { url: string; name: string; at: number };
  /** first heartbeat of each agent after pairing */
  seen?: Record<string, number>;
  timeline: { at: number; text: string; tone: 'info' | 'ok' | 'warn' }[];
}
