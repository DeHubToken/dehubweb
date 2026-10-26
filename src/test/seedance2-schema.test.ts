import { describe, expect, it } from 'vitest';
import { buildSeedance2Input } from '../../supabase/functions/_shared/seedance2-input';
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
  it('does not advertise seed or negative-prompt controls for these routes', () => {
    for (const model of ['seedance-2.0', 'seedance-2.0-fast']) {
      expect(VIDEO_MODELS[model].supportsSeed).toBe(false);
      expect(VIDEO_MODELS[model].supportsNegativePrompt).toBe(false);
    }
  });
});
