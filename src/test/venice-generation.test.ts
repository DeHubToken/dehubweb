import { afterEach, describe, expect, it, vi } from 'vitest';
import { atCostDhb, isVeniceImage, isVeniceVideo, veniceVideoOptions } from '../../supabase/functions/_shared/venice-catalog';
import { generateVeniceImage, quoteVenice, veniceFetch, VeniceError } from '../../supabase/functions/_shared/venice';
import { IMAGE_MODELS, getImageCostUsd } from '../constants/image-models.constants';
import { VIDEO_MODELS } from '../constants/video-models.constants';

afterEach(() => vi.unstubAllGlobals());
function api(...responses: Response[]) {
  vi.stubGlobal('Deno', { env: { get: () => 'test-server-key' } });
  const fetcher = vi.fn();
  for (const response of responses) fetcher.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('Venice pricing and requests', () => {
  it('uses the live image cost, with no margin or whole-DHB rounding', async () => {
    api(Response.json({ data: [{ id: 'z-image-turbo', model_spec: { pricing: { generation: { usd: 0.012345 } } } }] }));
    expect(await quoteVenice('venice-z-image-turbo', { quantity: 4 })).toMatchObject({ priceDhb: 49.38, priceUsd: 0.04938, markup: 0 });
    expect(atCostDhb(0.000123)).toBe(0.123);
    expect(getImageCostUsd(IMAGE_MODELS['venice-z-image-turbo'])).toBe(0.01);
  });
  it('rejects missing, offline and invalid prices instead of using a fallback estimate', async () => {
    api(Response.json({ data: [] }), Response.json({ data: [{ id: 'z-image-turbo', model_spec: { offline: true } }] }));
    await expect(quoteVenice('venice-z-image-turbo')).rejects.toThrow('unavailable');
    await expect(quoteVenice('venice-z-image-turbo')).rejects.toThrow('unavailable');
    for (const price of [NaN, Infinity, 0, -1]) expect(() => atCostDhb(price)).toThrow();
  });
  it('prices the exact video resolution and duration and omits aspect on image-to-video', async () => {
    const fetcher = api(Response.json({ quote: 0.173125 }));
    const quote = await quoteVenice('venice-wan-2-7-image', { durationSeconds: 10, resolution: '1080p', aspectRatio: '9:16' });
    expect(quote.priceDhb).toBe(173.125);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ model: 'wan-2-7-image-to-video', duration: '10s', resolution: '1080p' });
    expect(() => veniceVideoOptions('venice-wan-2-7-text', { durationSeconds: 7 })).toThrow();
    expect(() => veniceVideoOptions('venice-wan-2-7-text', { resolution: '480p' })).toThrow();
  });
  it('keeps safeguards enabled and returns a usable image data URL', async () => {
    const fetcher = api(Response.json({ images: ['aGVsbG8='] }));
    expect(await generateVeniceImage('venice-z-image-turbo', 'A coastal landscape', '9:16')).toMatchObject({ imageUrl: 'data:image/webp;base64,aGVsbG8=', provider: 'venice' });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({ safe_mode: true, width: 720, height: 1280, model: 'z-image-turbo' });
    expect(body.enhance_prompt).toBeUndefined();
  });
  it('does not retry refused or uncertain submissions', async () => {
    const fetcher = api(new Response('', { status: 422 }));
    await expect(veniceFetch('/video/queue', {}, true)).rejects.toMatchObject({ status: 400, uncertain: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockRejectedValueOnce(new TypeError('network interrupted'));
    await expect(veniceFetch('/video/queue', {}, true)).rejects.toMatchObject({ uncertain: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not accept inherited model names and exposes both video input modes', () => {
    expect(isVeniceImage('toString')).toBe(false);
    expect(isVeniceVideo('__proto__')).toBe(false);
    expect(VIDEO_MODELS['venice-wan-2-7-image'].supports).toEqual(['image-to-video']);
    expect(VIDEO_MODELS['venice-wan-2-7-text'].allowedDurations).toEqual([5, 10, 15]);
    expect(new VeniceError('test').uncertain).toBe(false);
  });
});
