/**
 * Abhed LLM gateway. Every agent thinks through here, so Abhed can meter tokens and cost per agent.
 * Route: GROQ_API_KEY set → Groq directly. Otherwise → the `kavach-llm` Supabase Edge Function, which
 * holds the provider keys in Supabase Vault (they never reach this app, git, or a browser).
 */

export const DEFAULT_MODEL = process.env.KAVACH_LLM_MODEL ?? 'openai/gpt-oss-120b';
export const GUARD_MODEL = 'meta-llama/llama-prompt-guard-2-86m';
// rupees per token, blended input/output (gpt-oss-120b on Groq ≈ $0.15 in / $0.60 out per 1M tokens)
export const INR_PER_TOKEN = 0.00003;

let upstreamUnavailable = false;

function route() {
  if (upstreamUnavailable) return null;
  if (process.env.GROQ_API_KEY) return { url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY, via: 'groq' };
  const sb = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (sb && key && process.env.KAVACH_LLM !== 'off') return { url: `${sb.replace(/\/$/, '')}/functions/v1/kavach-llm`, key, via: 'vault-proxy' };
  return null;
}

export const llmAvailable = () => route() !== null;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface ChatResult {
  message: ChatMessage & { reasoning?: string };
  tokens: number;
  costInr: number;
  model: string;
  ms: number;
}

export async function chat(body: { messages: ChatMessage[]; tools?: unknown[]; model?: string; temperature?: number; max_tokens?: number; response_format?: unknown }, timeoutMs = 20000): Promise<ChatResult> {
  const r = route();
  if (!r) throw new Error('No LLM configured');
  const model = body.model ?? DEFAULT_MODEL;
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const payload: Record<string, unknown> = { temperature: 0, ...body, model };
    if (body.tools?.length) payload.tool_choice = 'auto';
    const res = await fetch(r.url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${r.key}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      if (res.status === 404) upstreamUnavailable = true;
      throw new Error(`LLM ${res.status}: ${detail}`);
    }
    const data = (await res.json()) as { choices?: { message?: ChatResult['message'] }[]; usage?: { total_tokens?: number } };
    const m = data.choices?.[0]?.message;
    if (!m) throw new Error('LLM returned nothing');
    const tokens = data.usage?.total_tokens ?? 0;
    const message: ChatResult['message'] = { role: 'assistant', content: m.content ?? null };
    if (m.reasoning) message.reasoning = String(m.reasoning).slice(0, 600);
    if (m.tool_calls?.length) message.tool_calls = m.tool_calls.map((t) => ({ id: t.id, type: 'function' as const, function: { name: t.function.name, arguments: t.function.arguments } }));
    return { message, tokens, costInr: Number((tokens * INR_PER_TOKEN).toFixed(4)), model, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Llama Prompt Guard 2: a classifier trained to spot prompt injection and jailbreaks. */
export async function promptGuard(text: string): Promise<{ label: string; malicious: boolean } | null> {
  if (!llmAvailable() || !text.trim()) return null;
  try {
    const r = await chat({ model: GUARD_MODEL, max_tokens: 16, messages: [{ role: 'user', content: text.slice(0, 2000) }] }, 6000);
    const label = String(r.message.content ?? '').trim();
    // the model answers with a label or a probability of the text being malicious
    const p = Number(label);
    const malicious = Number.isFinite(p) ? p >= 0.5 : /malicious|injection|jailbreak|unsafe/i.test(label);
    return { label, malicious };
  } catch {
    return null;
  }
}
