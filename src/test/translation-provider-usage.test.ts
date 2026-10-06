// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  handler: undefined as undefined | ((request: Request) => Promise<Response>),
  cache: new Map<string, any>(),
}));
vi.mock('https://deno.land/std@0.168.0/http/server.ts', () => ({
  serve: (handler: (request: Request) => Promise<Response>) => { hooks.handler = handler; },
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => ({
  from: () => {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { filters[key] = value; return query; },
      maybeSingle: async () => ({ data: hooks.cache.get(`${filters.text_hash}:${filters.target_lang}`) ?? null }),
      upsert: async (row: any) => { hooks.cache.set(`${row.text_hash}:${row.target_lang}`, row); },
    };
    return query;
  },
  rpc: async () => ({ data: true }),
}) }));
vi.mock('../../supabase/functions/_shared/auth.ts', () => ({ rateLimitByIp: async () => null }));

let env: Record<string, string>;
let requests: string[];
let batches: any[][];
let pending: Promise<unknown>[];
let provider: (url: string) => Response;
const translated = 'Esta es una frase para nuestra comunidad.';
const source = 'This is a sentence for our community.';
const native = (text = translated) => new Response(JSON.stringify({
  modelVersion: 'gemini-fixture-version', candidates: [{ content: { parts: [{ text }] } }],
  usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5, thoughtsTokenCount: 2, cachedContentTokenCount: 3 },
}));
const gateway = () => new Response(JSON.stringify({ model: 'google/gemini-2.5-flash-lite',
  choices: [{ message: { content: translated } }], usage: { prompt_tokens: 21, completion_tokens: 6 },
}));
const request = (text = source) => new Request('https://fixture.invalid/translate-text', {
  method: 'POST', body: JSON.stringify({ text, targetLang: 'es', public: false }),
});

beforeEach(() => {
  vi.resetModules(); hooks.handler = undefined; hooks.cache.clear(); requests = []; batches = []; pending = [];
  env = { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
    GEMINI_API_KEY: 'fixture-google-key', LOVABLE_API_KEY: 'fixture-gateway-key' };
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] } });
  vi.stubGlobal('EdgeRuntime', { waitUntil: (work: Promise<unknown>) => pending.push(work) });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  provider = url => url.includes('googleapis') ? native() : gateway();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/rpc/record_ai_provider_usage')) {
      batches.push(JSON.parse(String(init.body)).p_rows); return new Response(null, { status: 204 });
    }
    requests.push(url);
    if (url.includes('mymemory')) return new Response(null, { status: 503 });
    return provider(url);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('meters native translation and serves repeat L1/L2 hits without another provider or aggregate write', async () => {
  await import('../../supabase/functions/translate-text/index');
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated });
  await Promise.all(pending);
  expect(batches).toHaveLength(1);
  expect(batches[0][0]).toMatchObject({ feature: 'translate-text', provider: 'google', route: 'direct',
    served_model: 'gemini-fixture-version', input_tokens: 20, output_tokens: 7, cached_tokens: 3,
    reasoning_tokens: 2, usage_reported: true, outcome: 'accepted' });
  const count = requests.length;
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated, cached: true });
  vi.resetModules(); await import('../../supabase/functions/translate-text/index');
  // The mocked persistent table survives the isolate reset.
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated, cached: true });
  expect(requests).toHaveLength(count);
  expect(batches).toHaveLength(1);
  expect(JSON.stringify(batches)).not.toMatch(/fixture-.*key|This is|Esta es|candidates|parts|choices/);
});

it('leaves partial and invalid native token reports missing', async () => {
  const { completionUsage } = await import('../../supabase/functions/_shared/ai-usage');
  expect(completionUsage({ usageMetadata: { promptTokenCount: -1, candidatesTokenCount: 3 } }))
    .toMatchObject({ input: null, output: 3 });
  expect(completionUsage({ usageMetadata: { promptTokenCount: 0 } }))
    .toMatchObject({ input: 0, output: null });
});

it('counts rejected direct output and fal failure in one batch before gateway success', async () => {
  env.FAL_KEY = 'fixture-fal-key';
  provider = url => url.includes('googleapis') ? native('I cannot translate this text')
    : url.includes('fal.run') ? new Response('private provider error', { status: 403 }) : gateway();
  await import('../../supabase/functions/translate-text/index');
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated });
  await Promise.all(pending);
  expect(batches).toHaveLength(1);
  expect(batches[0].map(row => row.outcome)).toEqual(['unusable_output', 'http_error', 'accepted']);
  expect(batches[0][0].output_tokens).toBe(7);
  expect(batches[0][2]).toMatchObject({ route: 'gateway', fallback_reason: 'fal_http_403', input_tokens: 21 });
  expect(JSON.stringify(batches)).not.toContain('private provider error');
});

it('records free translation attempts and keeps private content away from the training tier', async () => {
  env.GROQ_API_KEY = 'fixture-free-key'; env.MISTRAL_API_KEY = 'fixture-training-key';
  provider = url => url.includes('groq.com') ? new Response(JSON.stringify({ model: 'fixture-free-model',
    choices: [{ message: { content: translated } }], usage: { prompt_tokens: 9, completion_tokens: 4 },
  })) : gateway();
  await import('../../supabase/functions/translate-text/index');
  expect(await (await hooks.handler!(request())).json()).toMatchObject({ translatedText: translated });
  await Promise.all(pending);
  expect(batches[0][0]).toMatchObject({ route: 'free', input_tokens: 9, output_tokens: 4 });
  expect(requests.some(url => url.includes('mistral'))).toBe(false);
  expect(requests.some(url => url.includes('googleapis'))).toBe(false);
});

it('keeps fallback reasons local when requests overlap and marks absent fal usage as unknown', async () => {
  const { createTranslationUsage } = await import('../../supabase/functions/translate-text/usage');
  const first = createTranslationUsage(); const second = createTranslationUsage();
  first.start('google', 'fixture', 'direct')(429, 'http_error');
  second.skip('google', 'key_unset');
  first.start('fal', 'fixture', 'direct')(200, 'accepted', { output: 'private answer' });
  second.start('lovable', 'fixture', 'gateway')(200, 'accepted', { usage: { prompt_tokens: 1, completion_tokens: 2 } });
  first.flush(); second.flush(); await Promise.all(pending);
  expect(batches[0][1]).toMatchObject({ fallback_reason: 'google_http_429', usage_reported: false });
  expect(batches[1][0]).toMatchObject({ fallback_reason: 'google_key_unset', usage_reported: true });
  expect(JSON.stringify(batches)).not.toContain('private answer');
});
