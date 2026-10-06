import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(resolve(__dirname, '../pages/app/BuilderPage.tsx'), 'utf8');
const STYLES = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
const CHESS = readFileSync(resolve(__dirname, '../pages/ArcadeChessOnlinePage.tsx'), 'utf8');

describe('Builder theme background', () => {
  it('reserves the branded bloom for System', () => {
    expect(SOURCE).toContain("style={theme === 'system' ? BLOOM_BG : undefined}");
  });

  it('uses the shared canvas surface contract', () => {
    expect(SOURCE).toContain('data-builder-surface data-glass-page data-theme-page-surface');
    expect(STYLES).toMatch(/\[data-glass-page\]\s*\{\s*background-color: transparent !important;/);
  });

  it('keeps the online lobby above the shared canvas without changing the game surface', () => {
    expect(CHESS).toContain('data-glass-page data-theme-page-surface className="relative z-[1] min-h-screen bg-black"');
    expect(CHESS).toContain('className="fixed inset-0 z-[100] bg-black"');
  });
});
