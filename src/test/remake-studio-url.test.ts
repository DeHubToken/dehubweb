import { describe, expect, it } from 'vitest';
import { maboroshiStudioUrl } from '../lib/maboroshi-studio';

describe('hosted studio navigation', () => {
  it('preserves presets and Remake without widening the authenticated origin', () => {
    expect(maboroshiStudioUrl('plushie-takeover')).toBe('https://live.dehub.io/maboroshi/?preset=plushie-takeover');
    expect(maboroshiStudioUrl(undefined, true)).toBe('https://live.dehub.io/maboroshi/?workflow=remake');
    expect(maboroshiStudioUrl('plushie-takeover', true)).toBe('https://live.dehub.io/maboroshi/?preset=plushie-takeover&workflow=remake');
    for (const preset of ['https://evil.test/', '../setup', 'preset&redirect=https://evil.test', '</script>', 'a'.repeat(81)]) {
      const url = new URL(maboroshiStudioUrl(preset, true));
      expect(url.origin).toBe('https://live.dehub.io');
      expect(url.pathname).toBe('/maboroshi/');
      expect([...url.searchParams]).toEqual([['workflow', 'remake']]);
    }
  });
});
