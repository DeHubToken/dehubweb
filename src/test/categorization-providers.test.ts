// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../supabase/functions/_shared/transcripts.ts', () => ({ DEHUB_CDN_BASE: 'https://cdn.example/' }));
let env: Record<string, string>;
let requests: Array<{ url: string; body: any }>;
let batches: any[][];
let pending: Promise<unknown>[];
let answer: (body: any) => Response;
const completion = (model: string, categories = ['Science', 'Science', 'Invented']) =>
  new Response(JSON.stringify({ model, choices: [{ message: { tool_calls: [{ function: {
    name: 'categorize_post', arguments: JSON.stringify({ categories, confidence: 0.9, reasoning: 'Science lesson' }),
  } }] } }], usage: { prompt_tokens: 20, completion_tokens: 15 } }));
const input = { title: 'Science lesson', availableCategories: ['Science', 'Sports'], existing: [] };

beforeEach(() => {
  vi.resetModules(); requests = []; batches = []; pending = [];
  env = { GROQ_API_KEY: 'fixture-groq', GEMINI_API_KEY: 'fixture-google', LOVABLE_API_KEY: 'fixture-lovable',
    SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service' };
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] } });
  vi.stubGlobal('EdgeRuntime', { waitUntil: (p: Promise<unknown>) => pending.push(p) });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  answer = body => completion(body.model);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (url.endsWith('/rpc/record_ai_provider_usage')) { batches.push(body.p_rows); return new Response(null, { status: 204 }); }
    requests.push({ url, body });
    if (!url.includes('api.groq.com') && !url.includes('api.mistral.ai')) throw new Error('Unexpected paid provider');
    return answer(body);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('uses free text routing without requiring Google or Lovable keys and preserves category validation', async () => {
  delete env.GEMINI_API_KEY; delete env.LOVABLE_API_KEY;
  const { classify } = await import('../../supabase/functions/_shared/categorize');
  const result = await classify(input);
  expect(result.categories).toEqual(['Science']);
  expect(result.model).toBe('openai/gpt-oss-120b');
  expect(typeof requests[0].body.messages[1].content).toBe('string');
  await Promise.all(pending);
  expect(batches.flat()).toEqual([expect.objectContaining({ feature: 'categorize', route: 'free', outcome: 'accepted' })]);
});

it('sends images intact to the opt-in vision provider and retains the classification tool', async () => {
  const { classify } = await import('../../supabase/functions/_shared/categorize');
  await classify({ ...input, imageUrl: 'https://cdn.example/science.jpg' });
  expect(requests).toHaveLength(1);
  expect(requests[0].body.model).toBe('qwen/qwen3.8-27b');
  expect(requests[0].body.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: 'https://cdn.example/science.jpg' } });
  expect(requests[0].body.tool_choice.function.name).toBe('categorize_post');
});

it('uses available text when vision is rate limited without contacting a paid fallback', async () => {
  answer = body => body.model === 'qwen/qwen3.8-27b' ? new Response(null, { status: 429 }) : completion(body.model);
  const { classify } = await import('../../supabase/functions/_shared/categorize');
  const result = await classify({ ...input, imageUrl: 'https://cdn.example/science.jpg' });
  expect(result.categories).toEqual(['Science']);
  expect(result.reasoning).toContain('classified from text');
  expect(requests.map(r => r.body.model)).toEqual(['qwen/qwen3.8-27b', 'openai/gpt-oss-120b']);
});

it('leaves image-only posts pending when vision is unavailable', async () => {
  answer = () => new Response(null, { status: 429 });
  const { classify, CategorizationUnavailable } = await import('../../supabase/functions/_shared/categorize');
  await expect(classify({ availableCategories: ['Science'], imageUrl: 'https://cdn.example/image.jpg' }))
    .rejects.toBeInstanceOf(CategorizationUnavailable);
  expect(requests).toHaveLength(1);
});

it('does not send private transcripts to training providers when Groq fails', async () => {
  env.MISTRAL_API_KEY = 'fixture-mistral';
  answer = () => new Response(null, { status: 429 });
  const { classify, CategorizationUnavailable } = await import('../../supabase/functions/_shared/categorize');
  await expect(classify({ ...input, transcript: 'Private lecture', transcriptPublic: false }))
    .rejects.toBeInstanceOf(CategorizationUnavailable);
  expect(requests).toHaveLength(2);
  expect(requests.every(r => r.url.includes('api.groq.com'))).toBe(true);
});

it('allows public transcript fallback to the existing training tier', async () => {
  env.MISTRAL_API_KEY = 'fixture-mistral';
  answer = body => body.model.startsWith('openai/') ? new Response(null, { status: 429 }) : completion(body.model);
  const { classify } = await import('../../supabase/functions/_shared/categorize');
  const result = await classify({ ...input, transcript: 'Public lecture', transcriptPublic: true });
  expect(result.model).toBe('mistral-large-latest');
});

it('fails without calling paid providers when no free credentials are configured', async () => {
  delete env.GROQ_API_KEY;
  const { classify, CategorizationUnavailable } = await import('../../supabase/functions/_shared/categorize');
  await expect(classify(input)).rejects.toBeInstanceOf(CategorizationUnavailable);
  expect(requests).toHaveLength(0);
});

it('does not opt other shared-router callers into vision', async () => {
  const { tryFree } = await import('../../supabase/functions/_shared/free-models');
  const response = await tryFree({ messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://cdn.example/image.jpg' } }] }] });
  expect(response).toBeNull();
  expect(requests).toHaveLength(0);
});

it('never routes video or image-generation requests to the vision tier', async () => {
  const { tryFree } = await import('../../supabase/functions/_shared/free-models');
  expect(await tryFree({ messages: [{ role: 'user', content: [{ type: 'video_url', video_url: { url: 'https://cdn.example/video.mp4' } }] }] }, { allowVision: true })).toBeNull();
  expect(await tryFree({ modalities: ['image', 'text'], messages: [{ role: 'user', content: 'Generate a poster' }] }, { allowVision: true })).toBeNull();
  expect(requests).toHaveLength(0);
});
