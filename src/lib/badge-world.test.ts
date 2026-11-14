import { describe, expect, it } from 'vitest';
import { BADGE_LOOK_THEMES, BADGE_WORLD_THEMES, badgeLook, badgeWorld } from './badge-world';

describe('badge world routing', () => {
  it('routes every cinematic theme and the legacy snow preference', () => {
    for (const theme of BADGE_WORLD_THEMES) expect(badgeWorld(theme)).toBe(theme);
    expect(badgeWorld('christmas')).toBe('winter');
  });
  it('leaves metallic, Osaka stickers, and unknown themes with the material renderer', () => {
    for (const theme of ['system', 'dark', 'light', 'minimal', 'osaka', 'unknown']) expect(badgeWorld(theme)).toBeNull();
  });
  it('dresses the 3D badge for Glass and every cinematic theme, and for nothing else', () => {
    for (const theme of BADGE_LOOK_THEMES) expect(badgeLook(theme)).toBe(theme);
    expect(badgeLook('glass')).toBe('glass');
    expect(badgeLook('christmas')).toBe('winter');
    for (const theme of ['system', 'light', 'minimal', 'osaka', 'unknown']) expect(badgeLook(theme)).toBeNull();
  });
});
