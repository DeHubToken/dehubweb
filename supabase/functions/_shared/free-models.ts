// Free, no-card model tiers that answer the cheap jobs before anything we pay
// for: translation, summaries, suggested replies and default assistant chat.
//
// Each provider switches on when its key is set as a secret and is skipped
// otherwise, so shipping this changes nothing until a key lands. One account
// per provider — multiplying accounts to stack quotas breaks every one of
// these providers' terms.
//
// Every free tier here is rate limited per minute and per day. A 429 parks
// that provider in this isolate for as long as it asked (or a minute) and the
// next one answers; when they are all parked the caller falls through to the
// paid tiers exactly as before.

import type { UsageMeter } from './ai-usage.ts';

interface FreeProvider {
  name: string;
  url: () => string | null;
  key: () => string | undefined;
  model: string;
  /** The provider may train on what it is sent. Public content only. */
  trains?: boolean;
  /** Reasoning model: its hidden reasoning spends the same token budget. */
  reasons?: boolean;
  /** Too small for tool use: only plain text jobs (translation, summaries). */
  textOnly?: boolean;
  reasoningEffort?: string;
}

const env = (k: string) => Deno.env.get(k) || undefined;

const PROVIDERS: FreeProvider[] = [
  // 1,000 requests and 200k tokens a day per model, no training on our data.
  // The two sizes carry separate quotas.
  {
    name: 'groq/gpt-oss-120b',
    url: () => 'https://api.groq.com/openai/v1/chat/completions',
    key: () => env('GROQ_API_KEY'),
    model: 'openai/gpt-oss-120b',
    reasons: true,
  },
  {
    name: 'groq/gpt-oss-20b',
    url: () => 'https://api.groq.com/openai/v1/chat/completions',
    key: () => env('GROQ_API_KEY'),
    model: 'openai/gpt-oss-20b',
    reasons: true,
  },
  // The only free tier big enough for the translation volume on its own. Each
  // model has its own quota; small is capped at 20k tokens a minute on this
  // account, large at 250k (1 req/s) and ministral-8b at 625k (3 req/s).
  // The free tier's data may be used for training, hence `trains`.
  {
    name: 'mistral/large',
    url: () => 'https://api.mistral.ai/v1/chat/completions',
    key: () => env('MISTRAL_API_KEY'),
    model: 'mistral-large-latest',
    trains: true,
  },
  {
    name: 'mistral/ministral-8b',
    url: () => 'https://api.mistral.ai/v1/chat/completions',
    key: () => env('MISTRAL_API_KEY'),
    model: 'ministral-8b-latest',
    trains: true,
  },
  // 10,000 neurons a day — roughly 1,200 short calls on this model.
  {
    name: 'cloudflare/llama-3.1-8b',
    url: () => {
      // The project already stores these under the dashboard's lowercase names.
      const account = env('CLOUDFLARE_ACCOUNT_ID') ?? env('cloudflare_id');
      return account
        ? `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`
        : null;
    },
    key: () => env('CLOUDFLARE_AI_TOKEN') ?? env('cloudflare_apitoken'),
    model: '@cf/meta/llama-3.1-8b-instruct-fp8',
    // With the assistant's tool catalog it prints tool calls as prose and
    // garbles figures read back from them; it stays on plain text jobs.
    textOnly: true,
  },
];

// Opt-in image understanding; other callers keep their existing provider order.
const VISION_PROVIDERS: FreeProvider[] = [{
  name: 'groq/qwen3.8-27b',
  url: () => 'https://api.groq.com/openai/v1/chat/completions',
  key: () => env('GROQ_API_KEY'),
  model: 'qwen/qwen3.8-27b',
  reasoningEffort: 'none',
}];

/** The most recent free-tier refusal in this isolate, e.g. "mistral/large 401". */
export let lastFreeFailure: string | null = null;

/** Provider name → until when this isolate leaves it alone. */
const parkedUntil = new Map<string, number>();

function park(name: string, ms: number) {
  parkedUntil.set(name, Date.now() + ms);
}

/** Retry-After in ms, or the fallback when the header is missing or odd. */
function retryAfterMs(res: Response, fallback: number): number {
  const s = Number(res.headers.get('retry-after'));
  return Number.isFinite(s) && s > 0 ? Math.min(s * 1000, 60 * 60 * 1000) : fallback;
}

/** A tool-calling request, or a later round of one. */
function usesTools(body: Record<string, unknown>): boolean {
  if (body.tools || body.tool_choice) return true;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.some((m: { role?: string; tool_calls?: unknown }) => m?.role === 'tool' || !!m?.tool_calls);
}

/** Text-only requests: none of these tiers is given images or video. */
function isTextOnly(body: Record<string, unknown>): boolean {
  if (body.modalities) return false;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.every((m: { content?: unknown }) =>
    m?.content == null || typeof m.content === 'string'
  );
}

function isImageRequest(body: Record<string, unknown>): boolean {
  if (body.modalities || !Array.isArray(body.messages)) return false;
  let images = 0;
  const supported = body.messages.every((m: { content?: unknown }) => {
    if (m?.content == null || typeof m.content === 'string') return true;
    return Array.isArray(m.content) && m.content.every((part: any) => {
      if (part?.type === 'text' && typeof part.text === 'string') return true;
      if (part?.type === 'image_url' && typeof part.image_url?.url === 'string') {
        images++;
        return true;
      }
      return false;
    });
  });
  return supported && images > 0 && images <= 3;
}

/**
 * The OpenAI fields every provider here accepts. Mistral rejects unknown
 * fields outright, and `max_completion_tokens` is not one it knows.
 */
/**
 * Mistral only accepts tool-call ids of exactly nine letters and digits, and a
 * conversation whose earlier rounds another provider answered carries theirs.
 * Rewrite every id the same way on both sides so calls and results still pair.
 */
function mistralToolIds(messages: unknown): unknown {
  if (!Array.isArray(messages)) return messages;
  const fix = (id: unknown) =>
    typeof id === 'string' ? id.replace(/[^a-zA-Z0-9]/g, '').slice(-9).padStart(9, '0') : id;
  return messages.map((m: Record<string, unknown>) => {
    if (m?.role === 'tool') return { ...m, tool_call_id: fix(m.tool_call_id) };
    if (Array.isArray(m?.tool_calls)) {
      return { ...m, tool_calls: m.tool_calls.map((c: Record<string, unknown>) => ({ ...c, id: fix(c.id) })) };
    }
    return m;
  });
}

function portableBody(body: Record<string, unknown>, p: FreeProvider): Record<string, unknown> {
  const messages = p.name.startsWith('mistral/') ? mistralToolIds(body.messages) : body.messages;
  const out: Record<string, unknown> = { model: p.model, messages };
  if (p.reasoningEffort) out.reasoning_effort = p.reasoningEffort;
  const maxTokens = body.max_completion_tokens ?? body.max_tokens;
  if (p.reasons) {
    // Low effort keeps the hidden reasoning short (and inside the per-minute
    // token quota); the floor stops a 200-token budget being spent on
    // reasoning before any answer is written.
    out.reasoning_effort = 'low';
    out.max_tokens = Math.max(1024, Number(maxTokens) || 0);
  } else if (maxTokens != null) {
    out.max_tokens = maxTokens;
  }
  for (const k of ['tools', 'tool_choice', 'response_format', 'temperature', 'stream']) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

export interface FreeOptions {
  /** Image understanding only, never image generation or video input. */
  allowVision?: boolean;
  /**
   * The text is already public (a feed post, a bio, a public video's
   * transcript), so a provider that trains on its input may see it. Off by
   * default: DMs, drafts and assistant conversations never reach one.
   */
  publicContent?: boolean;
  expectToolCall?: string;
  label?: string;
  signal?: AbortSignal;
  /** Internal server accounting shared with the paid fallback routes. */
  meter?: UsageMeter;
}

function answered(text: string, expectToolCall?: string): boolean {
  try {
    const msg = JSON.parse(text)?.choices?.[0]?.message;
    if (!msg) return false;
    if (expectToolCall) {
      return Array.isArray(msg.tool_calls)
        && msg.tool_calls.some((c: { function?: { name?: string } }) => c?.function?.name === expectToolCall);
    }
    return Boolean((typeof msg.content === 'string' && msg.content.trim()) || msg.tool_calls?.length);
  } catch {
    return false;
  }
}

/**
 * Ask the free tiers in order. Returns the first usable answer, or null when
 * none is configured, all are parked, or all failed — the caller then moves on
 * to the tiers it pays for.
 */
export async function tryFree(
  body: Record<string, unknown>,
  opts: FreeOptions = {},
): Promise<Response | null> {
  const providers = isTextOnly(body) ? PROVIDERS
    : opts.allowVision && isImageRequest(body) ? VISION_PROVIDERS : [];
  if (!providers.length) return null;
  const tag = opts.label ? `[${opts.label}]` : '[free]';

  for (const p of providers) {
    const key = p.key();
    const url = p.url();
    if (!key || !url) continue;
    if (p.trains && !opts.publicContent) continue;
    if (p.textOnly && usesTools(body)) continue;
    if (Date.now() < (parkedUntil.get(p.name) ?? 0)) continue;

    const started = Date.now();
    const attempt = (status: number, outcome: string) => ({
      provider: p.name, route: 'free' as const, model: p.model, status, outcome, elapsedMs: Date.now() - started,
    });
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(portableBody(body, p)),
        signal: opts.signal,
      });

      if (!res.ok) {
        lastFreeFailure = `${p.name} ${res.status}`;
        opts.meter?.record(attempt(res.status, 'http_error'));
      }
      if (res.status === 429) {
        park(p.name, retryAfterMs(res, 15_000));
        console.log(`${tag} ${p.name} rate limited, parked`);
        await res.body?.cancel().catch(() => {});
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        park(p.name, 60 * 60 * 1000);
        console.log(`${tag} ${p.name} rejected the key (${res.status}), parked for an hour`);
        await res.body?.cancel().catch(() => {});
        continue;
      }
      if (!res.ok) {
        console.log(`${tag} ${p.name} failed (${res.status})`);
        await res.body?.cancel().catch(() => {});
        continue;
      }

      if (body.stream === true) return opts.meter ? opts.meter.stream(res, attempt(res.status, 'accepted')) : res;

      const text = await res.text();
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { /* Invalid output is counted below. */ }
      if (!answered(text, opts.expectToolCall)) {
        opts.meter?.record(attempt(res.status, 'unusable_output'), payload);
        console.log(`${tag} ${p.name} answered without usable output, trying next`);
        continue;
      }
      console.log(`${tag} answered by ${p.name}`);
      const accepted = attempt(res.status, 'accepted');
      opts.meter?.record(accepted, payload);
      const headers = opts.meter?.headersFor(res, accepted) ?? new Headers({ 'Content-Type': 'application/json' });
      headers.set('x-free-provider', p.name);
      return new Response(text, {
        status: 200,
        headers,
      });
    } catch (e) {
      opts.meter?.record(attempt(0, opts.signal?.aborted ? 'aborted' : 'transport_error'));
      if (opts.signal?.aborted) throw e;
      console.log(`${tag} ${p.name} transport failed`);
    }
  }
  return null;
}
