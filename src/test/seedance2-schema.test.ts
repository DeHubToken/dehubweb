import { describe, expect, it } from 'vitest';
import { buildSeedance2Input, buildSeedance2Request, seedance2RoutingDecision, seedance2QuoteRoute } from '../../supabase/functions/_shared/seedance2-input';
import { providerCostUsd, quotePriceDhb } from '../../supabase/functions/_shared/ai-pricing';
import { VIDEO_MODELS } from '../constants/video-models.constants';
import schemas from './fixtures/seedance2-schema.json';

describe('Seedance 2.0 verified provider contract', () => {
  it('uses the supported fields and string duration on normal and Fast endpoints', () => {
    for (const schema of schemas) {
      const input = buildSeedance2Input({ prompt: 'A bird takes flight', duration: '5s',
        ...(schema.endpoint.includes('image-to-video') ? { sourceImage: 'start.jpg', endFrameUrl: 'end.jpg' } : {}),
        ...(schema.endpoint.includes('reference-to-video') ? { sourceImage: 'subject.jpg', referenceImageUrls: ['setting.jpg'] } : {}),
      }).input;
      expect(Object.keys(input).every(key => schema.properties.includes(key))).toBe(true);
      expect(schema.durationEnum).toContain(input.duration);
      expect(schema.required.every(key => key in input)).toBe(true);
      expect(input).not.toHaveProperty('last_image_url');
      expect(input).not.toHaveProperty('negative_prompt');
      expect(input).not.toHaveProperty('seed');
    }
  });
  it('rejects unsupported controls and invalid end-frame combinations before submission', () => {
    expect(() => buildSeedance2Input({ prompt: 'Scene', seed: 0 })).toThrow('does not support');
    expect(() => buildSeedance2Input({ prompt: 'Scene', negativePrompt: 'blur' })).toThrow('does not support');
    expect(() => buildSeedance2Input({ prompt: 'Scene', endFrameUrl: 'end.jpg' })).toThrow('requires');
    expect(() => buildSeedance2Input({ prompt: 'Scene', sourceImage: 'start.jpg', endFrameUrl: 'end.jpg', referenceImageUrls: ['reference.jpg'] })).toThrow('cannot be combined');
    expect(() => buildSeedance2Input({ prompt: 'Scene', duration: '30s' })).toThrow('4 to 15');
    expect(buildSeedance2Input({ prompt: 'Scene', sourceImage: 'start.jpg', endFrameUrl: 'end.jpg' }).input.end_image_url).toBe('end.jpg');
  });
  it('routes video-only and start-image-plus-audio through the reference endpoint', () => {
    for (const prefix of ['bytedance/seedance-2.0', 'bytedance/seedance-2.0/fast']) {
      const routes = { falTextModel: `${prefix}/text-to-video`, falImageModel: `${prefix}/image-to-video`, falReferenceModel: `${prefix}/reference-to-video` };
      for (const references of [{ videoUrls: ['clip.mp4'] }, { sourceImage: 'start.jpg', audioUrls: ['audio.mp3'] }]) {
        const request = buildSeedance2Request(routes, { prompt: 'Scene', ...references });
        expect(request.appId).toBe(routes.falReferenceModel);
        expect(request.mode).toBe('reference');
        expect(request.input).not.toHaveProperty('image_url');
        const schema = schemas.find(value => value.endpoint === request.appId)!;
        expect(Object.keys(request.input).every(key => schema.properties.includes(key))).toBe(true);
      }
    }
  });
  it('rejects malformed nullable and array inputs rather than charging a silently changed request', () => {
    expect(() => buildSeedance2Input({ prompt: 'Scene', audioUrls: ['audio.mp3'] })).toThrow('require an image or video');
    expect(() => buildSeedance2Input({ prompt: 'Scene', referenceImageUrls: Array.from({ length: 9 }, (_, i) => `${i}.jpg`), audioUrls: ['a.mp3', 'b.mp3', 'c.mp3'], videoUrls: ['clip.mp4'] })).toThrow('12');
    for (const options of [{ sourceImage: null }, { audioUrls: null }, { audioUrls: 'audio.mp3' }, { videoUrls: [42] }, { duration: null }, { negativePrompt: null }]) {
      expect(() => buildSeedance2Input({ prompt: 'Scene', ...options } as never)).toThrow();
    }
  });
  it('keeps compatible direct routing but uses fal whenever a requested setting would be dropped', () => {
    expect(seedance2RoutingDecision({ resolution: '480p' })).toEqual({ provider: 'kie', reason: 'compatible-direct-route' });
    expect(seedance2RoutingDecision({ resolution: '720p', referenceImageUrls: ['person.jpg'] })).toEqual({ provider: 'kie', reason: 'compatible-direct-route' });
    expect(seedance2RoutingDecision({ resolution: '1080p' })).toEqual({ provider: 'fal', reason: 'requested-resolution' });
    expect(seedance2RoutingDecision({ audioUrls: ['speech.mp3'] })).toEqual({ provider: 'fal', reason: 'audio-reference' });
    expect(seedance2RoutingDecision({ videoUrls: ['motion.mp4'] })).toEqual({ provider: 'fal', reason: 'video-reference' });
    expect(seedance2RoutingDecision({ endFrameUrl: 'end.jpg' })).toEqual({ provider: 'fal', reason: 'end-frame' });
  });
  it('does not advertise seed or negative-prompt controls for these routes', () => {
    for (const model of ['seedance-2.0', 'seedance-2.0-fast']) {
      expect(VIDEO_MODELS[model].supportsSeed).toBe(false);
      expect(VIDEO_MODELS[model].supportsNegativePrompt).toBe(false);
      expect(VIDEO_MODELS[model].resolutions).toEqual(['480p', '720p']);
    }
  });
  it('quotes the selected provider while preserving cheaper compatible direct requests', () => {
    const quote = (model: string, hints: Parameters<typeof seedance2QuoteRoute>[1], available = true) => {
      const route = seedance2QuoteRoute(model, hints, available);
      const options = { durationSeconds: 5, videoProvider: route.provider };
      return { route, cost: providerCostUsd('video', model, options), price: quotePriceDhb('video', model, options) };
    };
    expect(quote('seedance-2.0', {}).cost).toBeCloseTo(0.825);
    for (const hints of [{ hasEndFrame: true }, { hasAudioReferences: true }, { hasVideoReferences: true }, { hasInlineMedia: true }]) {
      expect(quote('seedance-2.0', hints).route.provider).toBe('fal');
      expect(quote('seedance-2.0', hints).cost).toBeCloseTo(1.517);
      expect(quote('seedance-2.0', hints).price).toBeGreaterThan(quote('seedance-2.0', {}).price!);
    }
    expect(quote('seedance-2.0', {}, false).route.reason).toBe('direct-provider-unavailable');
    expect(quote('seedance-2.0-fast', {}).cost).toBeCloseTo(1.2095);
    expect(quote('seedance-2.0-fast', {}).route.reason).toBe('fast-provider-route');
  });
  it('rejects unpriced resolutions and malformed quote hints before debit', () => {
    for (const model of ['seedance-2.0', 'seedance-2.0-fast']) {
      expect(() => seedance2QuoteRoute(model, { resolution: '1080p' }, true)).toThrow('priced');
      expect(() => buildSeedance2Input({ prompt: 'Scene', resolution: '1080p' })).toThrow('priced');
      expect(() => seedance2QuoteRoute(model, { hasEndFrame: 'false' } as never, true)).toThrow('Invalid');
    }
  });
});
