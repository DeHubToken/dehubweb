// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../supabase/functions/_shared/dehub-brand-composite.ts', () => ({ compositeDeHubBranding: vi.fn(), extractQuotedHeadline: vi.fn(), pickLayoutForFormat: vi.fn() }));
vi.mock('../../supabase/functions/_shared/dehub-logo.ts', () => ({ DEHUB_LOGO_DATA_URI: 'unused-logo' }));
vi.mock('../../supabase/functions/_shared/generation-jobs.ts', () => ({ recordGeneration: (_charged: unknown, response: Response) => response }));
vi.mock('../../supabase/functions/_shared/creator-gallery.ts', () => ({ publishFreePoster: vi.fn() }));
vi.mock('../../supabase/functions/_shared/ai-payment-guard.ts', () => ({ chargeForJob: vi.fn(async () => ({ ok: true, priceDhb: 120, refund: vi.fn() })) }));
vi.mock('../../supabase/functions/_shared/ai-chat.ts', () => ({ aiChat: vi.fn() }));
vi.mock('../../supabase/functions/_shared/image-provider-fallback.ts', () => ({
  gatewayImage: vi.fn(), resilientImage: vi.fn(), IMAGE_UNAVAILABLE: 'Unavailable',
  ImageProviderError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock('../../supabase/functions/_shared/auth.ts', () => ({ corsHeaders: {}, serviceClient: vi.fn() }));
vi.mock('../../supabase/functions/_shared/dehub-template-banner.ts', () => ({ buildSpecFromPrompt: vi.fn(), renderTemplateBanner: vi.fn(), formatFromPosterSize: vi.fn() }));
vi.mock('../../supabase/functions/_shared/kie.ts', () => ({ kieKey: () => null, kieUsableUrl: () => true, kieCreateTask: vi.fn(), kieWaitForResult: vi.fn() }));
vi.mock('../../supabase/functions/_shared/venice-catalog.ts', () => ({ isVeniceImage: () => false }));
vi.mock('../../supabase/functions/_shared/venice.ts', () => ({ generateVeniceImage: vi.fn(), quoteVenice: vi.fn(), VeniceError: class extends Error {} }));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it.each([undefined, 'data:image/png;base64,unused'])('keeps the original relighting photo and prompt with brand terms, history and logo %s', async logoImage => {
  vi.resetModules();
  let handler!: (request: Request) => Promise<Response>;
  vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'FAL_KEY' ? 'fixture-fal' : undefined }, serve: (callback: typeof handler) => { handler = callback; } });
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ images: [{ url: 'https://output.test/relit.png' }] }));
  vi.stubGlobal('fetch', fetcher);
  const routePath = '../../supabase/functions/generate-image/index.ts';
  await import(routePath);
  const prompt = 'Relight this DeHub poster photo with warm light from the left, preserving the printed logo.';
  const sourceImage = 'https://input.test/original-photo.png';
  const response = await handler(new Request('https://edge.test/generate-image', { method: 'POST', body: JSON.stringify({
    model: 'iclight-v2', prompt, sourceImage, logoImage,
    conversationHistory: [{ role: 'user', content: 'Earlier unrelated request' }], aspectRatio: '16:9', bannerRenderer: 'scene',
  }) }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, imageUrl: 'https://output.test/relit.png', provider: 'fal', model: 'fal-ai/iclight-v2' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('https://fal.run/fal-ai/iclight-v2');
  const sent = JSON.parse(String(fetcher.mock.calls[0][1]!.body));
  expect(sent).toMatchObject({ prompt, image_url: sourceImage, image_size: { width: 1280, height: 720 }, num_images: 1 });
  const { resilientImage, gatewayImage } = await import('../../supabase/functions/_shared/image-provider-fallback');
  const { aiChat } = await import('../../supabase/functions/_shared/ai-chat');
  expect(resilientImage).not.toHaveBeenCalled(); expect(gatewayImage).not.toHaveBeenCalled(); expect(aiChat).not.toHaveBeenCalled();
});
it('never lets a template flag waive the required relighting source or bypass validation', async () => {
  vi.resetModules();
  let handler!: (request: Request) => Promise<Response>;
  vi.stubGlobal('Deno', { env: { get: () => undefined }, serve: (callback: typeof handler) => { handler = callback; } });
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const routePath = '../../supabase/functions/generate-image/index.ts'; await import(routePath);
  const response = await handler(new Request('https://edge.test/generate-image', { method: 'POST', body: JSON.stringify({
    model: 'iclight-v2', prompt: 'Relight this DeHub poster photo', bannerRenderer: 'template',
  }) }));
  expect(response.status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
});
