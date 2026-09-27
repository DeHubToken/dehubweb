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

interface FreeProvider {
  name: string;
  url: () => string | null;
  key: () => string | undefined;
  model: string;
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
  },
  {
    name: 'groq/gpt-oss-20b',
    url: () => 'https://api.groq.com/openai/v1/chat/completions',
    key: () => env('GROQ_API_KEY'),
    model: 'openai/gpt-oss-20b',
  },
  // The only free tier big enough for the translation volume on its own:
  // about a billion tokens a month, one request a second.
  {
    name: 'mistral/small',
    url: () => 'https://api.mistral.ai/v1/chat/completions',
    key: () => env('MISTRAL_API_KEY'),
    model: 'mistral-small-latest',
  },
  // 10,000 neurons a day — roughly 1,200 short calls on this model.
  {
    name: 'cloudflare/llama-3.1-8b',
    url: () => {
      const account = env('CLOUDFLARE_ACCOUNT_ID');
      return account
        ? `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`
        : null;
    },
    key: () => env('CLOUDFLARE_AI_TOKEN'),
    model: '@cf/meta/llama-3.1-8b-instruct-fp8',
  },
];

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

/** Text-only requests: none of these tiers is given images or video. */
function isTextOnly(body: Record<string, unknown>): boolean {
  if (body.modalities) return false;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.every((m: { content?: unknown }) =>
    m?.content == null || typeof m.content === 'string'
  );
}

/**
 * The OpenAI fields every provider here accepts. Mistral rejects unknown
 * fields outright, and `max_completion_tokens` is not one it knows.
 */
function portableBody(body: Record<string, unknown>, model: string): Record<string, unknown> {
  const out: Record<string, unknown> = { model, messages: body.messages };
  const maxTokens = body.max_completion_tokens ?? body.max_tokens;
  if (maxTokens != null) out.max_tokens = maxTokens;
  for (const k of ['tools', 'tool_choice', 'response_format', 'temperature', 'stream']) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

export interface FreeOptions {
  expectToolCall?: string;
  label?: string;
  signal?: AbortSignal;
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
  if (!isTextOnly(body)) return null;
  const tag = opts.label ? `[${opts.label}]` : '[free]';

  for (const p of PROVIDERS) {
    const key = p.key();
    const url = p.url();
    if (!key || !url) continue;
    if (Date.now() < (parkedUntil.get(p.name) ?? 0)) continue;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(portableBody(body, p.model)),
        signal: opts.signal,
      });

      if (res.status === 429) {
        park(p.name, retryAfterMs(res, 60_000));
        console.log(`${tag} ${p.name} rate limited, parked`);
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        park(p.name, 60 * 60 * 1000);
        console.log(`${tag} ${p.name} rejected the key (${res.status}), parked for an hour`);
        continue;
      }
      if (!res.ok) {
        console.log(`${tag} ${p.name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
        continue;
      }

      if (body.stream === true) return res;

      const text = await res.text();
      if (!answered(text, opts.expectToolCall)) {
        console.log(`${tag} ${p.name} answered without usable output, trying next`);
        continue;
      }
      console.log(`${tag} answered by ${p.name}`);
      return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      console.log(`${tag} ${p.name} threw: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }
  return null;
}
