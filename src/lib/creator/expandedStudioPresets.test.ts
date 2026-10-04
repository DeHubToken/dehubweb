import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { IMAGE_MODELS } from '@/constants/image-models.constants';
import { VIDEO_MODELS } from '@/constants/video-models.constants';
import { ALL_PRESETS, applyPreset, getPreset, presetsFor } from './presets';
import { EXPANDED_STUDIO_PRESETS } from './expandedStudioPresets';

describe('expanded studio catalog', () => {
  it('makes every new recipe selectable with a supported generation model and framing', () => {
    expect(EXPANDED_STUDIO_PRESETS).toHaveLength(100);
    expect(EXPANDED_STUDIO_PRESETS.filter((preset) => preset.kind === 'image')).toHaveLength(60);
    expect(EXPANDED_STUDIO_PRESETS.filter((preset) => preset.kind === 'video')).toHaveLength(40);
    expect(new Set(ALL_PRESETS.map((preset) => preset.id)).size).toBe(ALL_PRESETS.length);
    for (const preset of EXPANDED_STUDIO_PRESETS) {
      expect(getPreset(preset.id)).toBe(preset);
      expect(presetsFor(preset.kind)).toContain(preset);
      if (preset.kind === 'image') expect(IMAGE_MODELS[preset.model!]).toBeDefined();
      else {
        const model = VIDEO_MODELS[preset.model!];
        expect(model.aspectRatios).toContain(preset.aspect);
        expect(model.supports).toContain(preset.requiresImage ? 'image-to-video' : 'text-to-video');
      }
      expect(preset.template.match(/\{subject\}/g)).toHaveLength(1);
      expect(applyPreset(preset, '  a red bicycle  ')).toContain('a red bicycle');
      expect(applyPreset(preset, '')).toContain(preset.sample);
      expect(applyPreset(preset, '')).not.toContain('{subject}');
    }
  });

  it('requires a reference for every recipe that asks to animate an attached image', () => {
    const referenced = EXPANDED_STUDIO_PRESETS.filter((preset) => /attached/i.test(preset.template));
    expect(referenced).toHaveLength(6);
    expect(referenced.every((preset) => preset.requiresImage && preset.kind === 'video')).toBe(true);
    expect(EXPANDED_STUDIO_PRESETS.filter((preset) => preset.requiresImage)).toEqual(referenced);
  });

  it('provides distinct translated names and usable hints for the enlarged picker', () => {
    for (const language of ['en', 'fr']) {
      const locale = JSON.parse(readFileSync(`src/i18n/locales/${language}.json`, 'utf8'));
      const names = EXPANDED_STUDIO_PRESETS.map((preset) => locale.creator[preset.nameKey.split('.')[1]]);
      expect(names.every((name) => typeof name === 'string' && name.length > 0)).toBe(true);
      expect(new Set(names).size).toBe(EXPANDED_STUDIO_PRESETS.length);
      for (const preset of EXPANDED_STUDIO_PRESETS) {
        expect(locale.creator[preset.hintKey.split('.')[1]]).toBeTruthy();
      }
    }
  });
});
