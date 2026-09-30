import { describe, expect, it } from 'vitest';
import { BADGE_WORLD_THEMES, badgeWorld } from './badge-world';

describe('badge world routing', () => {
  it('routes every cinematic theme and the legacy snow preference', () => {
    for (const theme of BADGE_WORLD_THEMES) expect(badgeWorld(theme)).toBe(theme);
    expect(badgeWorld('christmas')).toBe('winter');
  });
  it('leaves metallic, Osaka stickers, and unknown themes with the material renderer', () => {
    for (const theme of ['system', 'dark', 'light', 'minimal', 'osaka', 'unknown']) expect(badgeWorld(theme)).toBeNull();
  });
});
