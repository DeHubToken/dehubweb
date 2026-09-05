// One place that decides *who* answers an OpenAI-shaped chat completion.
//
// Every text feature in here used to POST straight at ai.gateway.lovable.dev,
// which resells Google's own models at a markup and — the part that actually
// hurts — bills them from the same credit pool that pays for deploys. Run the
// balance down answering DMs and you can no longer ship the fix.
//
// So: Google first, on GEMINI_API_KEY, through their OpenAI-compatible
// endpoint. Same request body, same response shape, same model — only the
// billing route moves. The gateway stays wired underneath, so an unset key, a
// retired model id or a bad day at Google degrades to exactly the behaviour
// these functions had before instead of failing the request.
//
// This is the pattern translate-text proved: it was the only AI function still
// answering 200 the day the gateway started returning 402.

const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const GOOGLE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

/**
 * Gateway model id → the id Google answers to directly.
 *
 * Deliberately a whitelist rather than a `replace('google/', '')`: the gateway
 * carries models Google does not serve (and preview ids it renames), and a
 * wrong id there costs a wasted round trip on every single call. Anything not
 * listed simply goes to the gateway as before, which is why adding a model to
 * a call site can never break it.
 */
const DIRECT_MODELS: Record<string, string[]> = {
  'google/gemini-2.5-flash': ['gemini-2.5-flash'],
  'google/gemini-2.5-flash-lite': ['gemini-2.5-flash-lite'],
  'google/gemini-2.5-pro': ['gemini-2.5-pro'],
  // The gateway's own name for this one is a guess at Google's; the list is
  // walked so a renamed preview costs one 404 rather than silently pinning
  // this call site to the gateway forever.
  'google/gemini-3-flash-preview': ['gemini-3-flash-preview', 'gemini-3-flash', 'gemini-2.5-flash'],
};

/** Model ids Google has rejected in this isolate — not worth asking twice. */
const deadDirectModels = new Set<string>();

export interface AiChatOptions {
  /**
   * Name of the function the caller forced with `tool_choice`. A model that
   * answers 200 with prose instead of the tool call is useless to a caller
   * that only knows how to read arguments, so that counts as a failed tier and
   * falls through to the gateway rather than surfacing as a 502.
   */
  expectToolCall?: string;
  /** Prefixes log lines so a slow tier is attributable to a feature. */
  label?: string;
}

/** Rebuilds a JSON response after the body has been read for inspection. */
function jsonResponse(text: string, status: number): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function tryDirect(
  body: Record<string, unknown>,
  opts: AiChatOptions,
): Promise<Response | null> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return null;

  const requested = typeof body.model === 'string' ? body.model : '';
  const directModel = (DIRECT_MODELS[requested] ?? []).find((m) => !deadDirectModels.has(m));
  if (!directModel) return null;

  const tag = opts.label ? `[${opts.label}]` : '[ai-chat]';

  try {
    const res = await fetch(GOOGLE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, model: directModel }),
    });

    if (!res.ok) {
      // A 404 says the id is wrong and will stay wrong for this isolate's
      // lifetime; everything else (401, 429, 5xx) says nothing about the model,
      // so keep asking on later calls.
      if (res.status === 404) deadDirectModels.add(directModel);
      console.log(`${tag} gemini direct ${res.status}, falling back to gateway`);
      return null;
    }

    // A stream cannot be inspected without consuming it, and the caller wants
    // the pipe, not the payload.
    if (body.stream === true) return res;

    const text = await res.text();

    if (opts.expectToolCall) {
      try {
        const parsed = JSON.parse(text);
        const calls = parsed?.choices?.[0]?.message?.tool_calls;
        const got = Array.isArray(calls)
          ? calls.some((c: { function?: { name?: string } }) => c?.function?.name === opts.expectToolCall)
          : false;
        if (!got) {
          console.log(`${tag} gemini direct answered without ${opts.expectToolCall}, falling back`);
          return null;
        }
      } catch {
        console.log(`${tag} gemini direct returned unparseable JSON, falling back`);
        return null;
      }
    }

    return jsonResponse(text, res.status);
  } catch (e) {
    console.log(`${tag} gemini direct threw: ${e instanceof Error ? e.message : 'unknown'}`);
    return null;
  }
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
