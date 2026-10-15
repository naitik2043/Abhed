import type { World } from './types';

/** OWASP Top 10 for Agentic Applications (2026) categories we map events to. */
export const OWASP = {
  ASI01: 'ASI01 Agent goal hijack',
  ASI02: 'ASI02 Tool misuse',
  ASI03: 'ASI03 Identity & privilege abuse',
  ASI08: 'ASI08 Cascading failures',
  ASI09: 'ASI09 Human-agent trust exploitation',
  ASI10: 'ASI10 Rogue agents',
  LLM09: 'LLM09 Misinformation (hallucination)',
  LLM02: 'LLM02 Sensitive information disclosure',
} as const;

const INJECTION_PATTERNS: [RegExp, string][] = [
  [/ignore (all |any )?(previous|prior|above) (instructions|rules)/i, 'override instruction'],
  [/<!--[\s\S]*?-->/, 'hidden HTML comment'],
  [/\b(system|developer) (note|prompt|message)\b/i, 'fake system message'],
  [/\b(note|instruction)s? for the (ai|assistant|agent)\b|\bassistant:/i, 'addressed to the agent'],
  [/do not (tell|mention|inform)/i, 'secrecy request'],
  [/(export|dump|send|email|forward)[^.]{0,40}(all|every|entire)[^.]{0,30}(customer|patient|user|record)/i, 'bulk data request'],
  [/you are now|act as (an?|the) (admin|developer)|jailbreak/i, 'role override'],
  [/[A-Za-z0-9+/]{120,}={0,2}/, 'long encoded blob'],
];

export function scanInjection(text: string): { score: number; signals: string[] } {
  const signals = INJECTION_PATTERNS.filter(([re]) => re.test(text)).map(([, s]) => s);
  return { score: Math.min(1, signals.length / 3), signals };
}

function luhn(d: string) {
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = Number(d[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Data-loss prevention on anything leaving the organisation. */
export function dlpScan(params: Record<string, unknown>): string[] {
  const text = Object.entries(params)
    .filter(([k]) => !['to', 'patient', 'order', 'sku', 'customer'].includes(k))
    .map(([, v]) => (typeof v === 'string' ? v : ''))
    .join(' ');
  const found: string[] = [];
  if (/\b[A-Z]{5}\d{4}[A-Z]\b/.test(text)) found.push('PAN number');
  if (/\b\d{4}\s?\d{4}\s?\d{4}\b/.test(text)) found.push('Aadhaar-like number');
  for (const m of text.match(/\b(?:\d[ -]?){13,19}\b/g) ?? []) {
    const d = m.replace(/\D/g, '');
    if (d.length >= 13 && d.length <= 19 && luhn(d)) {
      found.push('card number');
      break;
    }
  }
  if ((text.match(/\b[6-9]\d{9}\b/g) ?? []).length >= 3) found.push('list of phone numbers');
  if ((text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).length >= 5) found.push('list of email addresses');
  return found;
}

export function securityEvent(
  w: World,
  e: { kind: string; agentId: string; detail: string; owasp: string; severity: 'low' | 'medium' | 'high' | 'critical' },
  now = Date.now(),
) {
  w.security ??= [];
  w.security.unshift({ at: now, ...e });
  if (w.security.length > 200) w.security.length = 200;
}
