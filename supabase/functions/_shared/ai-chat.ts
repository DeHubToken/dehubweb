// One place that decides *who* answers an OpenAI-shaped chat completion.
//
// Every text feature in here used to POST straight at ai.gateway.lovable.dev,
// which resells Google's own models at a markup and — the part that actually
// hurts — bills them from the same credit pool that pays for deploys. Run the
// balance down answering DMs and you can no longer ship the fix.
//
// So: Google first, on GEMINI_API_KEY, through their OpenAI-compatible
// endpoint. Same request body, same response shape — only the billing route
// moves. The gateway stays wired underneath, so an unset key, a retired model
// id or a bad day at Google degrades to exactly the behaviour these functions
// had before instead of failing the request.
//
// This is the pattern translate-text proved: it was the only AI function still
// answering 200 the day the gateway started returning 402.

import { tryFree } from './free-models.ts';
import { createUsageMeter, type UsageMeter } from './ai-usage.ts';

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

/** The cheap tier — what the free models in free-models.ts stand in for. */
const FREE_ELIGIBLE = new Set([
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'google/gemini-3-flash-preview',
  'google/gemini-3.5-flash-lite',
]);
const GOOGLE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

/**
 * Model ids this project's GEMINI_API_KEY is known to serve.
 *
 * Copied from translate-text, which has been answering live traffic on these
 * for weeks — that is the only evidence available, since the key's model list
 * cannot be read from here. Everything else is a guess, and a guess that 404s
 * silently pins a call site back onto the gateway forever, which is exactly
 * what happened on the first cut of this file: `gemini-2.5-flash` 404s for this
 * key, so every function asking for it fell straight back to Lovable.
 */
const KNOWN_GOOD = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];

/**
 * Gateway model id → the ids to try against Google, best first.
 *
 * The gateway's own name is tried first so a call site that asks for a
 * stronger model gets it where Google agrees to serve it, then the ladder
 * above catches the far more common case where it does not. Anything not
 * listed here goes to the gateway untouched, which is why adding a model at a
 * call site can never break it.
 */
const DIRECT_MODELS: Record<string, string[]> = {
  'google/gemini-2.5-flash': ['gemini-2.5-flash', ...KNOWN_GOOD],
  'google/gemini-2.5-flash-lite': ['gemini-2.5-flash-lite', ...KNOWN_GOOD],
  'google/gemini-2.5-pro': ['gemini-2.5-pro'],
  'google/gemini-3-flash-preview': ['gemini-3-flash-preview', ...KNOWN_GOOD],
  // KNOWN_GOOD's own head, asked for by name. Direct-only: the gateway has no
  // such id, so there is nothing to fall back to beyond the ladder.
  'google/gemini-3.5-flash-lite': [...KNOWN_GOOD],
};

/** Ids Google has 404'd in this isolate — not worth asking twice. */
const deadDirectModels = new Set<string>();

/**
 * Until when this isolate skips Google after a 429. A key over its quota stays
 * over it for minutes to a day, and asking again on every call only adds a
 * round trip before the gateway answers anyway. Short enough that raising the
 * quota takes effect without a redeploy.
 */
const QUOTA_BACKOFF_MS = 5 * 60 * 1000;
let directQuotaUntil = 0;

export interface AiChatOptions {
  /**
   * Name of the function the caller forced with `tool_choice`. A model that
   * answers 200 with prose instead of the tool call is useless to a caller
   * that only knows how to read arguments, so that counts as a failed tier and
   * falls through to the gateway rather than surfacing as a 502.
   */
  expectToolCall?: string;
  /** Prefixes log lines so a slow or failing tier is attributable. */
  label?: string;
  /** Aborts whichever tier is in flight — the caller's timeout, not ours. */
  signal?: AbortSignal;
  /** Public text only — lets free tiers that train on input answer. See free-models.ts. */
  publicContent?: boolean;
  /** Stop before the metered gateway, so the caller can try a cheaper paid tier first. */
  skipGateway?: boolean;
  /** Never ask a free tier. For calls whose output moves money. */
  noFree?: boolean;
  /** Preserve a caller's existing gateway credential when routing shared rounds. */
  gatewayKey?: string;
}

/** Rebuilds a JSON response after the body has been read for inspection. */
function jsonResponse(text: string, status: number): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** True when the payload carries the tool call the caller forced. */
function hasToolCall(text: string, name: string): boolean {
  try {
    const calls = JSON.parse(text)?.choices?.[0]?.message?.tool_calls;
    return Array.isArray(calls)
      && calls.some((c: { function?: { name?: string } }) => c?.function?.name === name);
  } catch {
    return false;
  }
}

async function tryDirect(
  body: Record<string, unknown>,
  opts: AiChatOptions,
  meter: UsageMeter,
): Promise<{ response?: Response; reason: string }> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return { reason: 'direct_key_unset' };
  if (Date.now() < directQuotaUntil) return { reason: 'direct_quota_backoff' };

  const requested = typeof body.model === 'string' ? body.model : '';
  const candidates = [...new Set(DIRECT_MODELS[requested] ?? [])].filter((m) => !deadDirectModels.has(m));
  if (candidates.length === 0) return { reason: DIRECT_MODELS[requested] ? 'direct_models_unavailable' : 'direct_model_unsupported' };

  const tag = opts.label ? `[${opts.label}]` : '[ai-chat]';

  for (const model of candidates) {
    const started = Date.now();
    const attempt = (status: number, outcome: string) => ({
      provider: 'google', route: 'direct' as const, model, status, outcome, elapsedMs: Date.now() - started,
    });
    try {
      const res = await fetch(GOOGLE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, model, ...(body.stream === true ? { stream_options: { include_usage: true } } : {}) }),
        signal: opts.signal,
      });

      // Only a 404 is about the model id, and it will stay true for this
      // isolate's lifetime — so retire that id and try the next one. A 401,
      // 429 or 5xx says nothing about the id, and walking the whole ladder on
      // those would turn one rejected request into four.
      if (res.status === 404) {
        meter.record(attempt(res.status, 'http_error'));
        deadDirectModels.add(model);
        console.log(`${tag} gemini ${model} unavailable (404), trying next`);
        await res.body?.cancel().catch(() => {});
        continue;
      }

      if (!res.ok) {
        meter.record(attempt(res.status, 'http_error'));
        // 402 is a key with no paid quota at all; it will not recover in minutes.
        if (res.status === 429) directQuotaUntil = Date.now() + QUOTA_BACKOFF_MS;
        if (res.status === 402) directQuotaUntil = Date.now() + 60 * 60 * 1000;
        console.log(`${tag} gemini direct ${res.status} on ${model}, falling back to gateway`);
        await res.body?.cancel().catch(() => {});
        return { reason: `direct_http_${res.status}` };
      }

      // A stream cannot be inspected without consuming it, and the caller
      // wants the pipe, not the payload.
      if (body.stream === true) return { response: meter.stream(res, attempt(res.status, 'accepted')), reason: 'none' };

      const text = await res.text();
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { /* Missing usage remains explicit. */ }

      if (opts.expectToolCall && !hasToolCall(text, opts.expectToolCall)) {
        meter.record(attempt(res.status, 'unusable_output'), payload);
        console.log(`${tag} gemini ${model} answered without ${opts.expectToolCall}, trying next`);
        continue;
      }

      console.log(`${tag} answered by gemini direct (${model})`);
      const accepted = attempt(res.status, 'accepted');
      meter.record(accepted, payload);
      return { response: new Response(text, { status: res.status, headers: meter.headersFor(res, accepted) }), reason: 'none' };
    } catch (e) {
      meter.record(attempt(0, opts.signal?.aborted ? 'aborted' : 'transport_error'));
      // The caller gave up; asking the gateway now would answer nobody.
      if (opts.signal?.aborted) throw e;
      console.log(`${tag} gemini direct transport failed`);
      return { reason: 'direct_transport_error' };
    }
  }

  console.log(`${tag} no direct model served this request, falling back to gateway`);
  return { reason: 'direct_no_usable_model' };
}

/**
 * POSTs an OpenAI-shaped chat completion, Google-direct where possible and via
 * the Lovable gateway otherwise.
 *
 * Preserves upstream bodies and status handling, including gateway 402s.
 * Provider headers and daily usage counters make the billing route visible.
 */
export async function aiChat(
  body: Record<string, unknown>,
  opts: AiChatOptions = {},
): Promise<Response> {
  const meter = createUsageMeter(opts.label, body.model);
  try {
    // Free tiers first for the cheap jobs. Pro is asked for by name and is never
    // quietly answered by a smaller free model.
    if (!opts.noFree && typeof body.model === 'string' && FREE_ELIGIBLE.has(body.model)) {
      const free = await tryFree(body, { ...opts, meter });
      if (free) return free;
    }

    const direct = await tryDirect(body, opts, meter);
    if (direct.response) return direct.response;

    if (opts.skipGateway) {
      return jsonResponse(JSON.stringify({ error: { message: 'Gateway skipped by caller' } }), 503);
    }

    const gatewayKey = opts.gatewayKey ?? Deno.env.get('LOVABLE_API_KEY');
    if (!gatewayKey) {
      // Nothing is configured at all. Mimic the gateway's own shape so callers
      // that branch on status keep working.
      return jsonResponse(JSON.stringify({ error: { message: 'No AI provider configured' } }), 500);
    }

    const started = Date.now();
    const gatewayAttempt = (status: number, outcome: string) => ({
      provider: 'lovable', route: 'gateway' as const, model: typeof body.model === 'string' ? body.model : 'unknown',
      status, outcome, fallback: direct.reason, elapsedMs: Date.now() - started,
    });
    let response: Response;
    try {
      response = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gatewayKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (error) {
      meter.record(gatewayAttempt(0, opts.signal?.aborted ? 'aborted' : 'transport_error'));
      throw error;
    }
    if (body.stream === true && response.ok) return meter.stream(response, gatewayAttempt(response.status, 'accepted'));
    const text = await response.text();
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { /* Preserve the upstream body even if it is not JSON. */ }
    const attempt = gatewayAttempt(response.status, response.ok ? 'accepted' : 'http_error');
    meter.record(attempt, payload);
    return new Response(text, { status: response.status, headers: meter.headersFor(response, attempt) });
  } finally {
    if (!meter.streaming) meter.flush();
  }
}
