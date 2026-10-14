import { describe, expect, it } from 'vitest';
import { VIRAL_EFFECTS, VIRAL_EFFECT_MODEL, VIRAL_FEATURED_IDS } from '../../supabase/functions/_shared/viral-effects';
import { buildCreatorFalVideoRequest } from '../../supabase/functions/_shared/creator-fal-input';
import schema from './fixtures/pixverse-effects-schema.json';

describe('video effect selection', () => {
  it('offers only exact provider effects and gives featured cards matching examples', () => {
    expect(VIRAL_EFFECTS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(VIRAL_EFFECTS.map(effect => effect.id)).size).toBe(VIRAL_EFFECTS.length);
    expect(VIRAL_EFFECTS.map(effect => effect.name)).toEqual(schema.properties.effect.enum);
    for (const id of VIRAL_FEATURED_IDS) {
      expect(VIRAL_EFFECTS.find(effect => effect.id === id)).toMatchObject({ preview: expect.stringMatching(/^https:\/\/media\.pixverse\.ai\//), poster: expect.any(String) });
    }
  });
  it('selects the effect endpoint instead of approximating the example with a prompt', () => {
    const request = buildCreatorFalVideoRequest(VIRAL_EFFECT_MODEL, { prompt: 'Earth Zoom', effect: 'Earth Zoom', sourceImage: 'https://example.com/photo.jpg' });
    expect(request).toEqual({ appId: 'fal-ai/pixverse/v5.5/effects', durationSeconds: 5,
      input: { effect: 'Earth Zoom', image_url: 'https://example.com/photo.jpg', duration: '5', resolution: '720p', enable_safety_checker: true } });
  });
  it('rejects missing input, invented effects and incompatible settings before charging', () => {
    const valid = { prompt: 'Earth Zoom', effect: 'Earth Zoom', sourceImage: 'https://example.com/photo.jpg' };
    for (const patch of [{ effect: undefined }, { effect: 'invented viral preset' }, { sourceImage: undefined }, { duration: 8 }, { resolution: '1080p' }, { videoUrls: ['https://example.com/clip.mp4'] }, { referenceImageUrls: ['https://example.com/second.jpg'] }]) {
      expect(() => buildCreatorFalVideoRequest(VIRAL_EFFECT_MODEL, { ...valid, ...patch })).toThrow();
    }
  });
});
