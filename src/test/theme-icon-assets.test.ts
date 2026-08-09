import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveThemeIconAsset } from '@/components/app/war/WarHudIcon';

const FULL_THEMES = ['hazy', 'swarms', 'winter', 'osaka', 'jungle'];
const PROFILE_KEYS = [
  'home', 'posts', 'images', 'videos', 'subscriptions', 'audio', 'live',
  'fractions', 'pinned', 'search', 'messages', 'bookmarks',
];
const PAGE_KEYS = [
  'wand', 'communities', 'careers', 'features', 'glossary', 'governance',
  'trophy', 'notifications', 'settings', 'stages', 'assistant', 'lock', 'profile',
];

describe('theme icon assets', () => {
  it('ships every profile and page icon for each full raster theme', () => {
    for (const theme of FULL_THEMES) {
      for (const key of [...PROFILE_KEYS, ...PAGE_KEYS]) {
        const file = resolve(__dirname, `../../public/theme-icons/${theme}/${key}.webp`);
        expect(existsSync(file), `${theme}/${key}.webp`).toBe(true);
        expect(statSync(file).size, `${theme}/${key}.webp is unexpectedly empty`).toBeGreaterThan(2_000);
      }
    }
  });

  it('ships the complete refreshed System page set', () => {
    for (const key of PAGE_KEYS) {
      const file = resolve(__dirname, `../../public/theme-icons/system/${key}.webp`);
      expect(existsSync(file), `system/${key}.webp`).toBe(true);
    }
  });

  it('routes old asset stems to the matching themed WebP', () => {
    expect(resolveThemeIconAsset('/assets/settings-icon-abc.png', 'system'))
      .toBe('/theme-icons/system/settings.webp');
    expect(resolveThemeIconAsset('/assets/notifications-icon-abc.png', 'winter'))
      .toBe('/theme-icons/winter/notifications.webp');
    expect(resolveThemeIconAsset('/assets/home-3d-icon-abc.png', 'jungle'))
      .toBe('/theme-icons/jungle/home.webp');
  });

  it('leaves Cosmic, Lava Lamp, Light and Minimal on their existing art', () => {
    for (const theme of ['cosmic', 'lavalamp', 'light', 'minimal']) {
      expect(resolveThemeIconAsset('/assets/home-3d-icon-abc.png', theme)).toBeNull();
      expect(resolveThemeIconAsset('/assets/settings-icon-abc.png', theme)).toBeNull();
    }
  });
});
