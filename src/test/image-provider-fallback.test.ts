// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let env: Record<string, string>;
let requests: Array<{ url: string; body: any; headers: Headers }>;
let batches: any[][];
let respond: (url: string, body: any) => Response;
const image = () => Response.json({ choices: [{ message: { images: [{ image_url: { url: 'https://output.invalid/image.png' } }] } }],
  usage: { prompt_tokens: 11, completion_tokens: 4 } });
const request = { requestedModel: 'flux-3-image', prompt: 'Edit this logo', sourceImage: 'data:image/png;base64,fixture', aspectRatio: '16:9' };

beforeEach(() => {
  vi.resetModules(); requests = []; batches = [];
  env = { LOVABLE_API_KEY: 'fixture-gateway', REPLICATE_API_KEY: 'fixture-replicate',
    SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service' };
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] } });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  respond = () => image();
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith('/rpc/record_ai_provider_usage')) { batches.push(body.p_rows); return new Response(null, { status: 204 }); }
    requests.push({ url, body, headers: new Headers(init.headers) });
    return respond(url, body);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('recovers the photographed TOP_UP failure while preserving every editing reference and reporting the actual route', async () => {
  const { resilientImage, ImageProviderError } = await import('../../supabase/functions/_shared/image-provider-fallback');
  const primary = vi.fn(async () => { throw new ImageProviderError(403, '{"detail":"User is locked. Reason: TOP_UP"}'); });
  const result = await resilientImage({ ...request, referenceImageUrls: ['https://input.invalid/second.png'] },
    { provider: 'fal', model: 'flux-3/edit', generate: primary });
  expect(result).toMatchObject({ provider: 'lovable', model: 'google/gemini-3.1-flash-image', fallbackUsed: true, fallbackReason: 'fal_http_403' });
  expect(requests).toHaveLength(1);
  expect(requests[0].body.messages[0].content).toEqual([
    { type: 'image_url', image_url: { url: request.sourceImage } },
    { type: 'image_url', image_url: { url: 'https://input.invalid/second.png' } },
    { type: 'text', text: request.prompt },
  ]);
  expect(batches[0].map(row => [row.provider, row.http_status, row.outcome])).toEqual([
    ['fal', 403, 'http_error'], ['lovable', 200, 'accepted'],
  ]);
  expect(JSON.stringify(batches)).not.toMatch(/Edit this logo|base64|fixture-gateway|fixture-service/);
  await resilientImage(request, { provider: 'fal', model: 'flux-3/edit', generate: primary });
  expect(primary).toHaveBeenCalledTimes(1);
});

it('uses funded Replicate editing after both earlier providers reject billing, without dropping the source', async () => {
  const { resilientImage, ImageProviderError } = await import('../../supabase/functions/_shared/image-provider-fallback');
  respond = url => url.includes('lovable') ? new Response('credits exhausted', { status: 402 })
    : Response.json({ status: 'succeeded', output: 'https://output.invalid/replicate.png' });
  const result = await resilientImage(request, { provider: 'fal', model: 'flux-3/edit',
    generate: async () => { throw new ImageProviderError(403, 'TOP_UP'); } });
  expect(result).toMatchObject({ provider: 'replicate', model: 'black-forest-labs/flux-kontext-pro', fallbackUsed: true });
  expect(requests[1].body.input).toMatchObject({ input_image: request.sourceImage, prompt: request.prompt, aspect_ratio: '16:9', safety_tolerance: 2 });
  expect(requests[1].headers.get('Cancel-After')).toBe('45s');
});

it('does not bypass safety refusals, invalid inputs, or ambiguous transport failures', async () => {
  const { resilientImage, ImageProviderError } = await import('../../supabase/functions/_shared/image-provider-fallback');
  for (const error of [new ImageProviderError(403, 'content_policy_violation'), new ImageProviderError(422, 'bad input'), new TypeError('fetch failed')]) {
    await expect(resilientImage(request, { provider: 'fal', model: 'edit', generate: async () => { throw error; } })).rejects.toThrow();
  }
  expect(requests).toHaveLength(0);
});

it('never turns multi-reference edits or vectors into incompatible backup jobs', async () => {
  const { resilientImage, ImageProviderError } = await import('../../supabase/functions/_shared/image-provider-fallback');
  respond = () => new Response('credits exhausted', { status: 402 });
  const primary = { provider: 'fal', model: 'edit', generate: async () => { throw new ImageProviderError(403, 'TOP_UP'); } };
  await expect(resilientImage({ ...request, referenceImageUrls: ['https://input.invalid/second.png'] }, primary)).rejects.toThrow();
  expect(requests).toHaveLength(1);
  await expect(resilientImage({ ...request, vector: true }, primary)).rejects.toThrow();
  expect(requests).toHaveLength(1);
});

it('stops at a gateway safety block instead of trying another provider', async () => {
  const { resilientImage, ImageProviderError } = await import('../../supabase/functions/_shared/image-provider-fallback');
  respond = () => Response.json({ choices: [{ finish_reason: 'stop', native_finish_reason: 'IMAGE_SAFETY' }] });
  await expect(resilientImage(request, { provider: 'fal', model: 'edit',
    generate: async () => { throw new ImageProviderError(403, 'TOP_UP'); } })).rejects.toMatchObject({ safetyBlocked: true });
  expect(requests).toHaveLength(1);
});

it('accepts complete synchronous Replicate output while its metrics are still processing', async () => {
  delete env.LOVABLE_API_KEY;
  const { resilientImage, ImageProviderError } = await import('../../supabase/functions/_shared/image-provider-fallback');
  respond = () => Response.json({ status: 'processing', output: 'https://output.invalid/complete.png' });
  await expect(resilientImage(request, { provider: 'fal', model: 'edit',
    generate: async () => { throw new ImageProviderError(402, 'credits exhausted'); } })).resolves.toMatchObject({ imageUrl: 'https://output.invalid/complete.png' });
  expect(requests).toHaveLength(1);
});

it('does not start or resubmit work when Replicate has already accepted the final attempt', async () => {
  delete env.LOVABLE_API_KEY;
  const { resilientImage, ImageProviderError } = await import('../../supabase/functions/_shared/image-provider-fallback');
  respond = url => url.endsWith('/cancel') ? new Response(null, { status: 204 })
    : Response.json({ id: 'accepted123', status: 'processing' });
  await expect(resilientImage(request, { provider: 'fal', model: 'edit',
    generate: async () => { throw new ImageProviderError(402, 'credits exhausted'); } })).rejects.toThrow();
  expect(requests.map(row => row.url)).toEqual([
    'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
    'https://api.replicate.com/v1/predictions/accepted123/cancel',
  ]);
});

it('uses the inexpensive text-only backup for a new image and never exposes upstream account details on exhaustion', async () => {
  const { resilientImage, ImageProviderError, IMAGE_UNAVAILABLE } = await import('../../supabase/functions/_shared/image-provider-fallback');
  respond = url => url.includes('lovable') ? new Response('credits exhausted', { status: 402 })
    : Response.json({ status: 'succeeded', output: ['https://output.invalid/new.png'] });
  const primary = { provider: 'fal', model: 'text-to-image', generate: async () => { throw new ImageProviderError(402, 'TOP_UP'); } };
  const result = await resilientImage({ requestedModel: 'z-image-turbo', prompt: 'A church', aspectRatio: '1:1' }, primary);
  expect(result.model).toBe('black-forest-labs/flux-schnell');
  expect(requests[1].body.input).toEqual({ prompt: 'A church', output_format: 'png', aspect_ratio: '1:1', num_outputs: 1 });
  respond = () => new Response('User is locked. Reason: TOP_UP', { status: 403 });
  await expect(resilientImage(request, primary)).rejects.toThrow(IMAGE_UNAVAILABLE);
});
