/** Daily server counters only: never persist prompts, answers, wallets or keys. */
export interface ProviderAttempt {
  provider: string;
  route: 'free' | 'direct' | 'gateway';
  model: string;
  status: number;
  outcome: string;
  fallback?: string;
  elapsedMs: number;
}

interface Usage {
  input: number | null;
  output: number | null;
  cached: number | null;
  reasoning: number | null;
}

const counter = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const dimension = (value: unknown, fallback = 'unknown'): string =>
  typeof value === 'string' && value.length > 0
    ? value.replace(/[^a-zA-Z0-9@_./:-]/g, '_').slice(0, 100) : fallback;

export function completionUsage(payload: unknown): Usage {
  const native = (payload as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata;
  if (native) {
    const candidates = counter(native.candidatesTokenCount);
    const thoughts = counter(native.thoughtsTokenCount);
    // Native Gemini reports candidates and thoughts separately. Output includes
    // both; cached input and reasoning remain subsets, never extra totals.
    const output = candidates == null ? null : counter(candidates + (thoughts ?? 0));
    return { input: counter(native.promptTokenCount), output,
      cached: counter(native.cachedContentTokenCount), reasoning: thoughts };
  }
  const usage = (payload as { usage?: Record<string, any> } | null)?.usage;
  return {
    input: counter(usage?.prompt_tokens ?? usage?.input_tokens),
    output: counter(usage?.completion_tokens ?? usage?.output_tokens),
    cached: counter(usage?.prompt_tokens_details?.cached_tokens ?? usage?.input_tokens_details?.cached_tokens),
    reasoning: counter(usage?.completion_tokens_details?.reasoning_tokens ?? usage?.output_tokens_details?.reasoning_tokens),
  };
}

export function createUsageMeter(feature: string | undefined, requestedModel: unknown) {
  const rows: Record<string, unknown>[] = [];
  let flushed = false;
  let streaming = false;

  const record = (attempt: ProviderAttempt, payload?: unknown) => {
    if (flushed) return;
    const usage = completionUsage(payload);
    rows.push({
      day: new Date().toISOString().slice(0, 10),
      feature: dimension(feature, 'chat'),
      provider: dimension(attempt.provider),
      route: attempt.route,
      requested_model: dimension(requestedModel),
      served_model: dimension((payload as { model?: unknown; modelVersion?: unknown } | null)?.model
        ?? (payload as { modelVersion?: unknown } | null)?.modelVersion, dimension(attempt.model)),
      outcome: dimension(attempt.outcome),
      fallback_reason: dimension(attempt.fallback, 'none'),
      http_status: attempt.status,
      elapsed_ms: Math.max(0, Math.round(attempt.elapsedMs)),
      input_tokens: usage.input ?? 0,
      output_tokens: usage.output ?? 0,
      cached_tokens: usage.cached ?? 0,
      reasoning_tokens: usage.reasoning ?? 0,
      usage_reported: usage.input != null && usage.output != null,
    });
  };

  const flush = () => {
    if (flushed || rows.length === 0) return;
    flushed = true;
    // The structured log remains available when the database write fails.
    for (const row of rows) console.log(JSON.stringify({ event: 'ai_provider_usage', ...row }));
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) { console.warn('ai_provider_usage_write_unconfigured'); return; }
    const write = fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/record_ai_provider_usage`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_rows: rows }),
      signal: AbortSignal.timeout(1500),
    }).then(async response => {
      if (!response.ok) console.warn('ai_provider_usage_write_failed', response.status);
      await response.body?.cancel();
    }).catch(() => { console.warn('ai_provider_usage_write_failed', 'transport'); });
    const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(write);
    // No retries or blocking provider responses when accounting is unavailable.
    void write;
  };

  const headersFor = (response: Response, attempt: ProviderAttempt) => {
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('x-ai-provider', dimension(attempt.provider));
    headers.set('x-ai-route', attempt.route);
    headers.set('x-ai-model', dimension(attempt.model));
    headers.set('x-ai-fallback', dimension(attempt.fallback, 'none'));
    return headers;
  };

  const stream = (response: Response, attempt: ProviderAttempt): Response => {
    streaming = true;
    if (!response.body) { record({ ...attempt, outcome: 'empty_stream' }); flush(); return response; }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let tail = '';
    let droppingLine = false;
    let payload: unknown;
    let finished = false;
    const started = Date.now();
    const finish = (outcome: string) => {
      if (finished) return;
      finished = true;
      record({ ...attempt, outcome, elapsedMs: attempt.elapsedMs + Date.now() - started }, payload);
      flush();
    };
    const inspect = (chunk: Uint8Array) => {
      const text = tail + decoder.decode(chunk, { stream: true });
      const lines = text.split('\n');
      tail = lines.pop() ?? '';
      for (const line of lines) {
        if (droppingLine) { droppingLine = false; continue; }
        if (line.length > 64 * 1024 || !line.startsWith('data:')) continue;
        try {
          const data = JSON.parse(line.slice(5).trim());
          if (data?.usage) payload = { usage: data.usage, model: data.model };
        } catch { /* Content chunks and [DONE] do not carry usage. */ }
      }
      if (tail.length > 64 * 1024) { tail = ''; droppingLine = true; }
    };
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) { inspect(new TextEncoder().encode('\n')); finish('accepted'); controller.close(); reader.releaseLock(); return; }
          inspect(next.value);
          controller.enqueue(next.value);
        } catch (error) { finish('stream_error'); controller.error(error); }
      },
      async cancel(reason) { finish('cancelled'); await reader.cancel(reason); },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: headersFor(response, attempt) });
  };

  return { record, flush, stream, headersFor, get streaming() { return streaming; } };
}

export type UsageMeter = ReturnType<typeof createUsageMeter>;

/** Meter an existing direct completion endpoint without changing its routing. */
export async function meteredCompletionFetch(
  url: string, init: RequestInit,
  context: { feature: string; model: string; provider: string; stream?: boolean; fallback?: string },
): Promise<Response> {
  const meter = createUsageMeter(context.feature, context.model);
  const started = Date.now();
  const attempt = (status: number, outcome: string): ProviderAttempt => ({
    provider: context.provider, route: 'direct', model: context.model, status, outcome,
    fallback: context.fallback, elapsedMs: Date.now() - started,
  });
  try {
    let response: Response;
    try { response = await fetch(url, init); }
    catch (error) { meter.record(attempt(0, init.signal?.aborted ? 'aborted' : 'transport_error')); throw error; }
    if (context.stream && response.ok) return meter.stream(response, attempt(response.status, 'accepted'));
    const text = await response.text();
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { /* Missing usage remains explicit. */ }
    const result = attempt(response.status, response.ok ? 'accepted' : 'http_error');
    meter.record(result, payload);
    return new Response(text, { status: response.status, headers: meter.headersFor(response, result) });
  } finally { if (!meter.streaming) meter.flush(); }
}
