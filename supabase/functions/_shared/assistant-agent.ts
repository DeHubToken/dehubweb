/**
 * Assistant agent loop.
 * =====================
 * The assistant used to work by keyword matching: a regex decided what the
 * question was about, the function pre-fetched one blob of context, and the
 * model got a single shot at answering it. That fails the moment a question
 * doesn't look like its keywords ("is she outposting me?" matches nothing) and
 * it can never follow up on what it just read.
 *
 * This runs a real tool-calling loop instead. The model is handed a catalog of
 * DeHub tools and decides for itself what to look up, in what order, and when
 * it has enough — so "how does my engagement compare to the people I tip most"
 * becomes three tool calls it chose, not a keyword list nobody wrote.
 *
 * The catalog is served by the API (`GET /assistant/tools`), not hardcoded here,
 * so a new capability ships with the backend and is live everywhere at once.
 */

const DEHUB_API_BASE = (Deno.env.get('DEHUB_API_BASE') || 'https://api.dehub.io').replace(/\/$/, '');
const SERVICE_SECRET = Deno.env.get('ASSISTANT_SERVICE_SECRET') || '';
export const GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

export type AgentSurface = 'chat' | 'assistant';

export interface ToolCatalogEntry {
  name: string;
  description: string;
  scope: 'public' | 'self';
  parameters: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

/** One tool the model actually invoked — surfaced to the UI as a trace. */
export interface ToolTraceEntry {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
}

export interface AgentResult {
  text: string;
  trace: ToolTraceEntry[];
  rounds: number;
  model: string;
}

export interface AgentOptions {
  messages: Array<{ role: string; content: unknown }>;
  systemPrompt: string;
  surface: AgentSurface;
  /** Wallet address of the asking user, or null when signed out. */
  caller: string | null;
  model: string;
  lovableApiKey: string;
  perplexityKey?: string;
  maxRounds?: number;
  maxTokens?: number;
  /** Abort the whole loop after this long. Chat needs a tighter budget. */
  timeoutMs?: number;
}

// ── Catalog ────────────────────────────────────────────────────────────────

interface CachedCatalog {
  tools: ToolCatalogEntry[];
  fetchedAt: number;
}
const catalogCache = new Map<AgentSurface, CachedCatalog>();
const CATALOG_TTL_MS = 5 * 60 * 1000;

/** True when the backend is reachable and configured for tool calls. */
export function agentConfigured(): boolean {
  return !!SERVICE_SECRET;
}

export async function fetchToolCatalog(surface: AgentSurface): Promise<ToolCatalogEntry[]> {
  const cached = catalogCache.get(surface);
  if (cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) return cached.tools;

  const res = await fetch(`${DEHUB_API_BASE}/assistant/tools?surface=${surface}`, {
    headers: { 'x-assistant-secret': SERVICE_SECRET },
  });
  if (!res.ok) throw new Error(`Tool catalog fetch failed: ${res.status}`);

  const body = await res.json();
  const tools: ToolCatalogEntry[] = body?.tools || [];
  catalogCache.set(surface, { tools, fetchedAt: Date.now() });
  return tools;
}

/**
 * Web search is executed here rather than by the API — it is the one capability
 * that lives outside DeHub's own data, and the Perplexity key lives in this
 * function's secrets. The model sees it as just another tool.
 */
export const WEB_SEARCH_TOOL: ToolCatalogEntry = {
  name: 'web_search',
  scope: 'public',
  description:
    'Search the live web for current information DeHub does not hold — news, prices, ' +
    'events, other platforms, anything after your training cutoff. Do not use it for ' +
    'questions about DeHub users, posts or stats; those have their own tools.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'What to search for' } },
    required: ['query'],
  },
};

// ── Execution ──────────────────────────────────────────────────────────────

export async function executeDeHubTool(
  name: string,
  args: Record<string, unknown>,
  caller: string | null,
  surface: AgentSurface,
): Promise<unknown> {
  const res = await fetch(`${DEHUB_API_BASE}/assistant/tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-assistant-secret': SERVICE_SECRET },
    body: JSON.stringify({ tool: name, args, caller, surface }),
  });
  if (!res.ok) return { error: `Tool call failed with status ${res.status}` };
  const body = await res.json();
  return body?.ok ? body.data : { error: body?.error || 'Tool failed' };
}

export async function executeWebSearch(query: string, perplexityKey?: string): Promise<unknown> {
  if (!perplexityKey) return { error: 'Web search is unavailable right now.' };

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${perplexityKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        { role: 'system', content: 'Be precise and factual. Include dates and sources.' },
        { role: 'user', content: query },
      ],
    }),
  });
  if (!res.ok) return { error: `Web search failed: ${res.status}` };

  const data = await res.json();
  return {
    result: (data.choices?.[0]?.message?.content || '').replace(/\[\d+\]/g, ''),
    sources: (data.citations || []).slice(0, 5),
  };
}

// ── The loop ───────────────────────────────────────────────────────────────

/**
 * Run the model with tools until it stops asking for them.
 *
 * Every round is one gateway call. Tool calls inside a round run in parallel —
 * the model routinely asks for three lookups at once and serialising them is
 * the difference between a 2s and a 6s answer.
 */
export async function runAgentLoop(opts: AgentOptions): Promise<AgentResult> {
  const {
    messages,
    systemPrompt,
    surface,
    caller,
    model,
    lovableApiKey,
    perplexityKey,
    maxRounds = surface === 'chat' ? 3 : 5,
    maxTokens = surface === 'chat' ? 700 : 3000,
    timeoutMs = surface === 'chat' ? 20_000 : 60_000,
  } = opts;

  const catalog = await fetchToolCatalog(surface);
  const allTools = [...catalog, WEB_SEARCH_TOOL];
  const toolSchemas = allTools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const convo: Array<Record<string, unknown>> = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const trace: ToolTraceEntry[] = [];
  const deadline = Date.now() + timeoutMs;
  let rounds = 0;

  for (let round = 0; round < maxRounds; round++) {
    rounds = round + 1;
    const remaining = deadline - Date.now();
    if (remaining <= 1000) break;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);

    // On the last round the tools are withheld, so the model has to answer from
    // what it already gathered rather than asking for more and returning
    // nothing usable.
    const isFinalRound = round === maxRounds - 1;

    let data: any;
    try {
      const res = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: convo,
          ...(isFinalRound ? {} : { tools: toolSchemas }),
          max_completion_tokens: maxTokens,
        }),
      });
      if (!res.ok) throw new Error(`Gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }

    const choice = data?.choices?.[0]?.message;
    if (!choice) throw new Error('Gateway returned no message');

    const toolCalls = choice.tool_calls || [];
    if (!toolCalls.length) {
      return { text: (choice.content || '').trim(), trace, rounds, model };
    }

    // Echo the assistant turn back verbatim — the API requires the tool_calls
    // message to precede its tool results.
    convo.push(choice);

    const results = await Promise.all(
      toolCalls.map(async (call: any) => {
        const name = call.function?.name;
        let args: Record<string, unknown> = {};
        try {
          args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }

        const started = Date.now();
        let output: unknown;
        try {
          output =
            name === 'web_search'
              ? await executeWebSearch(String(args.query || ''), perplexityKey)
              : await executeDeHubTool(name, args, caller, surface);
        } catch (err) {
          output = { error: err instanceof Error ? err.message : 'Tool threw' };
        }

        const ok = !(output && typeof output === 'object' && 'error' in (output as any));
        trace.push({ tool: name, args, ok, ms: Date.now() - started });

        return {
          role: 'tool',
          tool_call_id: call.id,
          name,
          content: JSON.stringify(output).slice(0, 12_000),
        };
      }),
    );

    convo.push(...results);
  }

  // Only reachable when the deadline cut the loop short mid-tool-call. Spend a
  // few seconds turning whatever was gathered into an answer rather than
  // throwing away the work.
  const salvage = new AbortController();
  const salvageTimer = setTimeout(() => salvage.abort(), 8000);
  try {
    const finalRes = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
      signal: salvage.signal,
      body: JSON.stringify({
        model,
        messages: [
          ...convo,
          {
            role: 'user',
            content: 'Answer now using only what you have already looked up. Do not request more data.',
          },
        ],
        max_completion_tokens: maxTokens,
      }),
    });
    if (!finalRes.ok) throw new Error(`Gateway ${finalRes.status} on final turn`);
    const finalData = await finalRes.json();

    return {
      text: (finalData?.choices?.[0]?.message?.content || '').trim(),
      trace,
      rounds,
      model,
    };
  } finally {
    clearTimeout(salvageTimer);
  }
}
