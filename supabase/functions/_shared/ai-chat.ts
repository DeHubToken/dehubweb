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

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
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
  'google/gemini-2.5-pro': ['gemini-2.5-pro', ...KNOWN_GOOD],
  'google/gemini-3-flash-preview': ['gemini-3-flash-preview', ...KNOWN_GOOD],
};

/** Ids Google has 404'd in this isolate — not worth asking twice. */
const deadDirectModels = new Set<string>();

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
): Promise<Response | null> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return null;

  const requested = typeof body.model === 'string' ? body.model : '';
  const candidates = (DIRECT_MODELS[requested] ?? []).filter((m) => !deadDirectModels.has(m));
  if (candidates.length === 0) return null;

  const tag = opts.label ? `[${opts.label}]` : '[ai-chat]';

  for (const model of candidates) {
    try {
      const res = await fetch(GOOGLE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, model }),
      });

      // Only a 404 is about the model id, and it will stay true for this
      // isolate's lifetime — so retire that id and try the next one. A 401,
      // 429 or 5xx says nothing about the id, and walking the whole ladder on
      // those would turn one rejected request into four.
      if (res.status === 404) {
        deadDirectModels.add(model);
        console.log(`${tag} gemini ${model} unavailable (404), trying next`);
        continue;
      }

      if (!res.ok) {
        console.log(`${tag} gemini direct ${res.status} on ${model}, falling back to gateway`);
        return null;
      }

      // A stream cannot be inspected without consuming it, and the caller
      // wants the pipe, not the payload.
      if (body.stream === true) return res;

      const text = await res.text();

      if (opts.expectToolCall && !hasToolCall(text, opts.expectToolCall)) {
        console.log(`${tag} gemini ${model} answered without ${opts.expectToolCall}, trying next`);
        continue;
      }

      console.log(`${tag} answered by gemini direct (${model})`);
      return jsonResponse(text, res.status);
    } catch (e) {
      console.log(`${tag} gemini direct threw: ${e instanceof Error ? e.message : 'unknown'}`);
      return null;
    }
  }

  console.log(`${tag} no direct model served this request, falling back to gateway`);
  return null;
}

/**
 * POSTs an OpenAI-shaped chat completion, Google-direct where possible and via
 * the Lovable gateway otherwise.
 *
 * Returns the upstream `Response` untouched, so callers keep their own status
 * handling — including the 402 that means the gateway's credits are gone.
 */
export async function aiChat(
  body: Record<string, unknown>,
  opts: AiChatOptions = {},
): Promise<Response> {
  const direct = await tryDirect(body, opts);
  if (direct) return direct;

  const gatewayKey = Deno.env.get('LOVABLE_API_KEY');
  if (!gatewayKey) {
    // Nothing is configured at all. Mimic the gateway's own shape so callers
    // that branch on status keep working.
    return jsonResponse(JSON.stringify({ error: { message: 'No AI provider configured' } }), 500);
  }

  return await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${gatewayKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
