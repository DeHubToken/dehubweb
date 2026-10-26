import { describe, expect, it } from 'vitest';
import { buildCreatorFalVideoRequest } from '../../supabase/functions/_shared/creator-fal-input';

describe('Creator advanced generation contract', () => {
  const options = { prompt: 'A bird takes flight', duration: '5s', aspectRatio: '16:9', sourceImage: 'https://example.com/start.jpg' };
  it('preserves seed zero and routes both frame URLs to the provider', () => {
    const request = buildCreatorFalVideoRequest('vidu-q3', { ...options, seed: 0, endFrameUrl: 'https://example.com/end.jpg' });
    expect(request.input.seed).toBe(0);
    expect(request.input.end_image_url).toBe('https://example.com/end.jpg');
    expect(request.input.image_url).toBe(options.sourceImage);
  });
  it('rejects unsupported options before charging', () => {
    expect(() => buildCreatorFalVideoRequest('kling-3-turbo-pro', { ...options, seed: 0 })).toThrow();
    expect(() => buildCreatorFalVideoRequest('vidu-q3', { ...options, sourceImage: undefined, endFrameUrl: 'https://example.com/end.jpg' })).toThrow();
  });
});
