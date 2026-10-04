import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { IMAGE_MODELS } from '@/constants/image-models.constants';
import { VIDEO_MODELS, videoSupportsText } from '@/constants/video-models.constants';
import { ALL_PRESETS, applyPreset, getPreset, presetsFor } from './presets';
import { OPEN_STUDIO_PRESETS } from './openStudioPresets';

describe('published studio presets', () => {
  it('exposes every published image and video recipe once through the existing catalog', () => {
    expect(OPEN_STUDIO_PRESETS).toHaveLength(24);
    expect(OPEN_STUDIO_PRESETS.filter((p) => p.kind === 'image')).toHaveLength(12);
    expect(OPEN_STUDIO_PRESETS.filter((p) => p.kind === 'video')).toHaveLength(12);
    expect(new Set(ALL_PRESETS.map((p) => p.id)).size).toBe(ALL_PRESETS.length);
    for (const preset of OPEN_STUDIO_PRESETS) {
      expect(getPreset(preset.id)).toBe(preset);
      expect(presetsFor(preset.kind)).toContain(preset);
      expect(preset.requiresImage).not.toBe(true);
      if (preset.kind === 'image') expect(IMAGE_MODELS[preset.model!]).toBeDefined();
      else {
        expect(VIDEO_MODELS[preset.model!]).toBeDefined();
        expect(videoSupportsText(VIDEO_MODELS[preset.model!])).toBe(true);
      }
      expect(preset.template.match(/\{subject\}/g)).toHaveLength(1);
      expect(applyPreset(preset, '  a red bicycle  ')).toContain('a red bicycle');
      expect(applyPreset(preset, ' ')).not.toContain('{subject}');
    }
  });

  it('retains the source shot instructions while replacing only the subject', () => {
    const preset = getPreset('open-record-whip-pan');
    expect(applyPreset(preset, '')).toBe('Whip pan from a spinning record to a dancer mid-turn, tungsten glow, heavy motion blur');
    expect(applyPreset(preset, 'a piano to a singer')).toBe('Whip pan from a piano to a singer, tungsten glow, heavy motion blur');
  });

  it('ships labels and hints in each locale included with the import', () => {
    for (const language of ['en', 'fr']) {
      const locale = JSON.parse(readFileSync(`src/i18n/locales/${language}.json`, 'utf8'));
      for (const preset of OPEN_STUDIO_PRESETS) {
        expect(locale.creator[preset.nameKey.split('.')[1]]).toBeTruthy();
        expect(locale.creator[preset.hintKey.split('.')[1]]).toBeTruthy();
      }
    }
  });
});
