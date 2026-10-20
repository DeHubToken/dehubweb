import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveThemeIconAsset } from '@/components/app/war/WarHudIcon';
import { DEFAULT_THEME_HUES } from '@/contexts/ThemeContext';
import { isDocsCanvasTheme } from '@/lib/docs-theme';

const source = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');
describe('Glass coverage', () => {
  it('shares the saved colour and the docs canvas contract', () => {
    expect(DEFAULT_THEME_HUES.glass).toBe(185);
    expect(isDocsCanvasTheme('glass')).toBe(true);
    expect(source('src/hooks/use-feed-swallow-clip.ts')).toContain("'glass'");
    expect(source('src/lib/theme-css.ts')).toContain("import('@/styles/glass.css')");
  });
  it('owns every semantic icon and preserves currency artwork', () => {
    const manifest = JSON.parse(source('public/theme-icons/pack-manifest.json'));
    for (const key of manifest.keys) {
      expect(resolveThemeIconAsset(`/theme-icons/system/${key}.webp`, 'glass')).toBe(`/theme-icons/glass/${key}.svg`);
      expect(existsSync(resolve(__dirname, `../../public/theme-icons/glass/${key}.svg`))).toBe(true);
    }
    expect(resolveThemeIconAsset('/dehub-coin.png', 'glass')).toBeNull();
  });
  it('keeps direct posts and both overlay layers transparent, with accessible motion', () => {
    const css = source('src/styles/glass.css');
    for (const marker of ['data-post-page', 'data-post-overlay', 'data-post-overlay-backdrop', 'data-main-panel', 'data-feed-nav-outer']) expect(css).toContain(`[${marker}]`);
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('prefers-reduced-transparency: reduce');
    const scene = source('src/components/app/GlassBackground.tsx');
    expect(scene).toContain('subscribeBackgroundPaused');
    expect(scene).toContain("removeEventListener('visibilitychange'");
  });
});
