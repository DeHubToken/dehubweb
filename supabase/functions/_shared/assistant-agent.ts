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

/**
 * `admin` is godmode's assistant. It is authenticated as an admin rather than
 * as a wallet, and its catalog reads across the platform, the source history
 * and the server log — so it is the one surface that must be asked for by name
 * and never fallen into by default.
 */
export type AgentSurface = 'chat' | 'assistant' | 'admin';

export interface ToolCatalogEntry {
  name: string;
  description: string;
  /**
   * What the tool reads, as the API describes it. Nothing here branches on it —
   * the API decides what each surface is offered and the catalog it returns is
   * already cut — so this exists to stay truthful about what arrives.
   * `code` reads DeHub's own source and no user data at all.
   */
  scope: 'public' | 'self' | 'code' | 'admin';
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
  /**
   * The asking user's DeHub access token, forwarded to the API so it can verify
   * it and derive the caller itself.
   *
   * Deliberately a token and not an address: this function is publicly
   * callable, so an address in the request body is attacker-controlled, and the
   * personal-data tools would happily read whoever the attacker named. Only the
   * API decides who is asking.
   */
  userToken: string | null;
  /**
   * On the `admin` surface only: the short-lived, assistant-only token the API
   * minted for the admin who asked. Not their panel session — that never leaves
   * `api.dehub.io`. The API verifies this on the way back in and decides which
   * tools that admin's role may reach, so it is required for the admin catalog
   * to contain anything at all.
   */
  adminToken?: string | null;
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

export async function fetchToolCatalog(
  surface: AgentSurface,
  adminToken?: string | null,
): Promise<ToolCatalogEntry[]> {
  // The admin catalog is cut to the asking admin's role, so caching it per
  // surface would serve a super admin's tool list — the server log, the source
  // tree, the audit trail — to the next moderator who asked. Admin traffic is
  // a handful of questions a day; the cache buys nothing worth that.
  const cacheable = surface !== 'admin';

  const cached = cacheable ? catalogCache.get(surface) : undefined;
  if (cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) return cached.tools;

  const res = await fetch(`${DEHUB_API_BASE}/assistant/tools?surface=${surface}`, {
    headers: {
      'x-assistant-secret': SERVICE_SECRET,
      ...(adminToken && { 'x-admin-token': adminToken }),
    },
  });
  if (!res.ok) throw new Error(`Tool catalog fetch failed: ${res.status}`);

  const body = await res.json();
  const tools: ToolCatalogEntry[] = body?.tools || [];
  if (cacheable) catalogCache.set(surface, { tools, fetchedAt: Date.now() });
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
  userToken: string | null,
  surface: AgentSurface,
  adminToken?: string | null,
): Promise<unknown> {
  const res = await fetch(`${DEHUB_API_BASE}/assistant/tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-assistant-secret': SERVICE_SECRET,
      // The API verifies this and derives the caller from it. Absent or
      // expired means the request is treated as signed out.
      ...(userToken && { 'x-dehub-token': userToken }),
      // Same idea one surface over: the API verifies this and decides which of
      // the admin tools this admin's role is allowed to run.
      ...(adminToken && { 'x-admin-token': adminToken }),
    },
    body: JSON.stringify({ tool: name, args, surface }),
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
    userToken,
    adminToken,
    model,
    lovableApiKey,
    perplexityKey,
    // An admin question is a chain, not a lookup: reports spiked, so what
    // shipped, so what does that commit do, so what is the log saying. Five
    // rounds runs out halfway through that and the answer arrives half-derived.
    maxRounds = surface === 'chat' ? 3 : surface === 'admin' ? 9 : 5,
    maxTokens = surface === 'chat' ? 700 : 3000,
    timeoutMs = surface === 'chat' ? 20_000 : surface === 'admin' ? 120_000 : 60_000,
  } = opts;

  const catalog = await fetchToolCatalog(surface, adminToken);
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
              : await executeDeHubTool(name, args, userToken, surface, adminToken);
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
