import { describe, expect, it } from 'vitest';
import { CREATOR_FAL_IMAGE_MODELS, CREATOR_FAL_VIDEO_MODELS, creatorFalImageAspects } from '../../supabase/functions/_shared/creator-fal-catalog';
import { buildCreatorFalImageRequest, buildCreatorFalVideoRequest, creatorFalImageDimensions, creatorFalImageResult } from '../../supabase/functions/_shared/creator-fal-input';
import { quotePriceDhb } from '../../supabase/functions/_shared/ai-pricing';
import fixture from './fixtures/provider-schema-20261026.json';
import expandFixture from './fixtures/bria-expand-schema.json';

type Schema = Record<string, any>;
/** Public input contracts captured26 October2026, independently of our builders. */
function validate(value: unknown, schema: Schema, definitions: Record<string, Schema>): boolean {
  if (schema.$ref) return validate(value, definitions[schema.$ref.split('/').pop()!], definitions);
  if (schema.anyOf && !schema.anyOf.some((s: Schema) => validate(value, s, definitions))) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === 'string' && typeof value !== 'string') return false;
  if (schema.type === 'integer' && !Number.isInteger(value)) return false;
  if (schema.type === 'number' && typeof value !== 'number') return false;
  if (schema.type === 'boolean' && typeof value !== 'boolean') return false;
  if (schema.type === 'null' && value !== null) return false;
  if (typeof value === 'number' && ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) return false;
  if (typeof value === 'string' && ((schema.minLength !== undefined && value.length < schema.minLength) || (schema.maxLength !== undefined && value.length > schema.maxLength))) return false;
  if (schema.type === 'array') {
    if (!Array.isArray(value) || (schema.minItems !== undefined && value.length < schema.minItems) || (schema.maxItems !== undefined && value.length > schema.maxItems)) return false;
    return !schema.items || value.every(item => validate(item, schema.items, definitions));
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    if (schema.required?.some((key: string) => record[key] === undefined)) return false;
    return Object.entries(record).every(([key, v]) => schema.properties[key] && validate(v, schema.properties[key], definitions));
  }
  return true;
}
function assertContract(request: { appId: string; input: Record<string, unknown> }) {
  const contract = request.appId === 'fal-ai/bria/expand' ? expandFixture : (fixture as Record<string, { input: Schema; schemas: Record<string, Schema> }>)[request.appId];
  expect(contract, request.appId).toBeDefined();
  expect(validate(request.input, contract.input, contract.schemas), `${request.appId}: ${JSON.stringify(request.input)}`).toBe(true);
}

describe('creator fal video requests', () => {
  for (const model of Object.values(CREATOR_FAL_VIDEO_MODELS)) {
    it(`${model.name} accepts the options exposed by the creator`, () => {
      if (model.family === 'avatar') {
        expect(() => buildCreatorFalVideoRequest(model.id, { prompt: 'Speak' })).toThrow('reviewed inline');
        expect(quotePriceDhb('video', model.id, { durationSeconds: 5 })).toBe(338);
        return;
      }
      const durations = model.allowedDurations ?? [model.minDuration, model.defaultDuration, model.maxDuration];
      for (const duration of durations) for (const resolution of model.resolutions) for (const aspectRatio of model.aspectRatios) {
        for (const sourceImage of model.referenceMode === 'extend' ? [undefined] : model.requiresVideoInput || !model.supports.includes('text-to-video') ? ['https://example.com/start.jpg'] : [undefined, 'https://example.com/start.jpg']) {
          const request = buildCreatorFalVideoRequest(model.id, { prompt: 'A red panda walks along a mossy log.', sourceImage, duration: `${duration}s`, resolution, aspectRatio, ...(model.family === 'pixverseeffects' ? { effect: 'Earth Zoom' } : {}), ...(model.requiresVideoInput ? { videoUrls: ['https://example.com/clip.mp4'] } : {}) });
          expect(request.durationSeconds).toBe(duration);
          assertContract(request);
        }
        if (model.supportsEndFrame) assertContract(buildCreatorFalVideoRequest(model.id, {
          prompt: 'The scene unfolds.', sourceImage: 'https://example.com/start.jpg', endFrameUrl: 'https://example.com/end.jpg', duration, resolution, aspectRatio,
        }));
      }
      if (model.supportsAudioInput) assertContract(buildCreatorFalVideoRequest(model.id, {
        prompt: 'A speaker talks.', sourceImage: 'https://example.com/start.jpg', audioUrls: ['https://example.com/voice.mp3'], seed: 42,
      }));
      expect(quotePriceDhb('video', model.id, { durationSeconds: model.maxDuration })).toBeGreaterThan(0);
    });
  }

  it('rejects invalid and unsupported options before a paid request can be submitted', () => {
    for (const options of [
      { duration: 'auto' }, { duration: '4s' }, { duration: '21s' }, { duration: '-5s' }, { duration: '5.5s' },
      { resolution: '480p' }, { aspectRatio: '4:5' }, { endFrameUrl: 'https://example.com/end.jpg' },
      { referenceImageUrls: ['https://example.com/reference.jpg'] }, { negativePrompt: 'blur' }, { seed: 42 },
    ]) expect(() => buildCreatorFalVideoRequest('flux-3-video', { prompt: 'A moving scene', ...options })).toThrow();
  });

  it('uses the FLUX frame endpoint and omits resolution on drafts', () => {
    const full = buildCreatorFalVideoRequest('flux-3-video', { prompt: 'An unfolding scene', sourceImage: 'start.jpg', endFrameUrl: 'end.jpg', duration: '20s' });
    expect(full.appId).toBe('blackforestlabs/flux-3/first-last-frame-to-video');
    expect(full.input).toMatchObject({ start_image_url: 'start.jpg', end_image_url: 'end.jpg', duration: 20 });
    expect(full.input).not.toHaveProperty('image_url');
    const draft = buildCreatorFalVideoRequest('flux-3-draft', { prompt: 'An unfolding scene', duration: '20s' });
    expect(draft.input).not.toHaveProperty('resolution');
    expect(quotePriceDhb('video', 'flux-3-draft', { durationSeconds: 20 })).toBe(1440);
  });

  it('uses Ray multi-keyframes for 10-second image animation', () => {
    const request = buildCreatorFalVideoRequest('luma-ray3.2', { prompt: 'A moving scene', sourceImage: 'start.jpg', endFrameUrl: 'end.jpg', duration: '10s' });
    expect(request.input).toMatchObject({ keyframes: ['start.jpg', 'end.jpg'], keyframe_indexes: [0, 240] });
    expect(request.input).not.toHaveProperty('image_url');
  });
});

describe('creator fal image requests', () => {
  for (const model of Object.values(CREATOR_FAL_IMAGE_MODELS)) {
    it(`${model.name} sends only documented fields`, () => {
      for (const aspect of creatorFalImageAspects(model.id)) {
        if (!model.requiresImage) assertContract(buildCreatorFalImageRequest(model.id, 'A ceramic teapot on a wooden table.', undefined, aspect));
        if (model.supportsEdit) assertContract(buildCreatorFalImageRequest(model.id, 'Make the teapot blue.', 'https://example.com/teapot.jpg', aspect));
      }
      if (!model.supportsEdit) expect(() => buildCreatorFalImageRequest(model.id, 'Make it blue.', 'https://example.com/teapot.jpg')).toThrow();
      if (model.editUsesPlural) assertContract(buildCreatorFalImageRequest(model.id, 'Combine the subjects.', undefined, '1:1',
        ['https://example.com/a.jpg', 'https://example.com/b.jpg', 'https://example.com/c.jpg', 'https://example.com/d.jpg'].slice(0, model.maxReferenceImages ?? 4)));
      expect(quotePriceDhb('image', model.id)).toBeGreaterThan(0);
    });
  }

  it('preserves framing without crossing the one-megapixel billing boundary', () => {
    for (const aspect of ['1:1', '4:5', '16:9', '9:16', '3:2', '2:3', '21:9']) {
      const { width, height } = creatorFalImageDimensions(aspect);
      const [w, h] = aspect.split(':').map(Number);
      expect(width / height).toBeCloseTo(w / h, 6);
      expect(width * height).toBeLessThanOrEqual(1_000_000);
    }
    expect(() => buildCreatorFalImageRequest('nucleus-image', 'A scene', undefined, '21:9')).toThrow();
    expect(() => buildCreatorFalImageRequest('qwen-image-max', 'a'.repeat(801))).toThrow();
    expect(() => buildCreatorFalVideoRequest('vidu-q3', { prompt: 'a'.repeat(2001) })).toThrow();
    expect(() => buildCreatorFalVideoRequest('kling-3-turbo-pro', { prompt: 'a'.repeat(3073) })).toThrow();
  });
  it('requires an image for expansion and permits automatic expansion without a prompt', () => {
    expect(() => buildCreatorFalImageRequest('bria-expand', '')).toThrow('Attach one image');
    expect(() => buildCreatorFalImageRequest('bria-expand', '新背景', 'https://media/source.jpg')).toThrow('English');
    const request = buildCreatorFalImageRequest('bria-expand', '', 'https://media/source.jpg', '16:9');
    expect(request.input).toEqual({ image_url: 'https://media/source.jpg', canvas_size: [1280, 720], aspect_ratio: '16:9' });
    assertContract(request);
    expect(quotePriceDhb('image', 'bria-expand')).toBe(48);
    expect(quotePriceDhb('image', 'bria-expand', { quantity: 3 })).toBe(144);
    expect(creatorFalImageResult('bria-expand', { image: { url: 'https://media/expanded.png' } })).toBe('https://media/expanded.png');
    expect(creatorFalImageResult('flux-schnell', { images: [{ url: 'https://media/generated.png' }] })).toBe('https://media/generated.png');
    expect(() => creatorFalImageResult('bria-expand', { images: [{ url: 'https://media/wrong-shape.png' }] })).toThrow('no image');
    expect(() => buildCreatorFalImageRequest('bria-expand', '', 'source.jpg', '21:9')).toThrow('aspect');
    expect(() => buildCreatorFalImageRequest('bria-expand', '', 'one.jpg', '1:1', ['two.jpg'])).toThrow('references');
  });
});
