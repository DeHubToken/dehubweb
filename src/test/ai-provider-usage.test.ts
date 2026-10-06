// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

declare global { var Deno: { env: { get: (name: string) => string | undefined } }; }

let env: Record<string, string>;
let provider: (url: string, body: any) => Promise<Response>;
let requests: Array<{ url: string; body: any; headers: Headers }>;
let batches: any[][];
let pending: Promise<unknown>[];
const completed = (model: string, message: Record<string, unknown> = { content: 'answer' }) =>
  new Response(JSON.stringify({ model, choices: [{ message }], usage: {
    prompt_tokens: 12, completion_tokens: 7,
    prompt_tokens_details: { cached_tokens: 3 }, completion_tokens_details: { reasoning_tokens: 2 },
  } }), { headers: { 'Content-Type': 'application/json' } });
const body = { model: 'google/gemini-2.5-pro', messages: [{ role: 'user', content: 'private prompt' }] };

beforeEach(() => {
  vi.resetModules(); requests = []; batches = []; pending = [];
  env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key', LOVABLE_API_KEY: 'fixture-gateway-key' };
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] } });
  vi.stubGlobal('EdgeRuntime', { waitUntil: (work: Promise<unknown>) => pending.push(work) });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  provider = async (_url, request) => completed(request.model);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body));
    if (url.endsWith('/rpc/record_ai_provider_usage')) { batches.push(request.p_rows); return new Response(null, { status: 204 }); }
    requests.push({ url, body: request, headers: new Headers(init.headers) });
    return provider(url, request);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('preserves Pro after a direct 404 and records the fallback without prompts or keys', async () => {
  env.GEMINI_API_KEY = 'fixture-google-key';
  provider = async (url, request) => url.includes('googleapis') ? new Response(null, { status: 404 }) : completed(request.model);
  const { aiChat } = await import('../../supabase/functions/_shared/ai-chat');
  const response = await aiChat(body, { label: 'assistant' });
  expect(requests.map(request => request.body.model)).toEqual(['gemini-2.5-pro', 'google/gemini-2.5-pro']);
  expect(response.headers.get('x-ai-fallback')).toBe('direct_no_usable_model');
  expect((await response.json()).model).toBe(body.model);
  await Promise.all(pending);
  expect(batches).toHaveLength(1);
  expect(batches[0]).toHaveLength(2);
  expect(batches[0][1]).toMatchObject({ route: 'gateway', input_tokens: 12, output_tokens: 7, cached_tokens: 3, reasoning_tokens: 2, usage_reported: true });
  expect(JSON.stringify(batches)).not.toMatch(/private prompt|fixture-.*key|messages|choices/);
});

it('counts billed output discarded for missing the required tool', async () => {
  env.GEMINI_API_KEY = 'fixture-google-key';
  provider = async (_url, request) => completed(request.model, request.model === 'gemini-2.5-flash'
    ? { content: 'wrong output' } : { tool_calls: [{ function: { name: 'perform', arguments: '{}' } }] });
  const { aiChat } = await import('../../supabase/functions/_shared/ai-chat');
  await aiChat({ ...body, model: 'google/gemini-2.5-flash' }, { noFree: true, expectToolCall: 'perform' });
  await Promise.all(pending);
  expect(batches[0].map(row => row.outcome)).toEqual(['unusable_output', 'accepted']);
  expect(batches[0].map(row => row.input_tokens)).toEqual([12, 12]);
});

it('keeps private content off the training tier', async () => {
  env.MISTRAL_API_KEY = 'fixture-training-key';
  const { aiChat } = await import('../../supabase/functions/_shared/ai-chat');
  await aiChat({ ...body, model: 'google/gemini-2.5-flash' });
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toContain('ai.gateway.lovable.dev');
});

it('passes streamed bytes unchanged and records split final usage without content', async () => {
  env.GEMINI_API_KEY = 'fixture-google-key';
  const text = 'data: {"choices":[{"delta":{"content":"private answer 🌍"}}]}\n\n'
    + 'data: {"model":"gemini-2.5-pro","usage":{"prompt_tokens":11,"completion_tokens":5}}\n\ndata: [DONE]\n\n';
  const bytes = new TextEncoder().encode(text);
  provider = async () => new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
  const { aiChat } = await import('../../supabase/functions/_shared/ai-chat');
  const response = await aiChat({ ...body, stream: true });
  expect(requests[0].body.stream_options).toEqual({ include_usage: true });
  expect(await response.text()).toBe(text);
  await Promise.all(pending);
  expect(batches[0][0]).toMatchObject({ input_tokens: 11, output_tokens: 5, usage_reported: true, outcome: 'accepted' });
  expect(JSON.stringify(batches)).not.toContain('private answer');
});

it('records cancelled streams as missing usage rather than zero-cost calls', async () => {
  env.GEMINI_API_KEY = 'fixture-google-key';
  provider = async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new TextEncoder().encode('data: {}\n\n')); } }));
  const { aiChat } = await import('../../supabase/functions/_shared/ai-chat');
  const response = await aiChat({ ...body, stream: true });
  await response.body!.cancel();
  await Promise.all(pending);
  expect(batches[0][0]).toMatchObject({ outcome: 'cancelled', usage_reported: false });
});

it('backs off a quota failure instead of retrying Google on the next request', async () => {
  env.GEMINI_API_KEY = 'fixture-google-key';
  provider = async (url, request) => url.includes('googleapis') ? new Response(null, { status: 429 }) : completed(request.model);
  const { aiChat } = await import('../../supabase/functions/_shared/ai-chat');
  await aiChat(body);
  const next = await aiChat(body);
  expect(requests.filter(request => request.url.includes('googleapis'))).toHaveLength(1);
  expect(next.headers.get('x-ai-fallback')).toBe('direct_quota_backoff');
});

it('does not start a gateway generation after the caller aborts', async () => {
  env.GEMINI_API_KEY = 'fixture-google-key';
  const controller = new AbortController();
  provider = async () => { controller.abort(); throw new DOMException('Stopped', 'AbortError'); };
  const { aiChat } = await import('../../supabase/functions/_shared/ai-chat');
  await expect(aiChat(body, { signal: controller.signal })).rejects.toThrow('Stopped');
  expect(requests).toHaveLength(1);
  await Promise.all(pending);
  expect(batches[0][0]).toMatchObject({ outcome: 'aborted', usage_reported: false });
});

it('preserves the assistant gateway credential and requested unsupported model', async () => {
  const { postCompletion } = await import('../../supabase/functions/_shared/assistant-agent');
  await postCompletion({ ...body, model: 'openai/gpt-5-mini' }, 'fixture-caller-key', new AbortController().signal);
  expect(requests[0].body.model).toBe('openai/gpt-5-mini');
  expect(requests[0].headers.get('authorization')).toBe('Bearer fixture-caller-key');
  await Promise.all(pending);
  expect(batches[0][0].route).toBe('gateway');
});

it('keeps delivering an answer when accounting fails and sends no retry', async () => {
  let writes = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/rpc/record_ai_provider_usage')) { writes++; return new Response(null, { status: 503 }); }
    return completed(body.model);
  }));
  const { aiChat } = await import('../../supabase/functions/_shared/ai-chat');
  const response = await aiChat(body);
  expect((await response.json()).choices[0].message.content).toBe('answer');
  await Promise.all(pending);
  expect(writes).toBe(1);
  expect(console.warn).toHaveBeenCalledWith('ai_provider_usage_write_failed', 503);
});
