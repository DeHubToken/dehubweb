import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FEEDS = ['HomeFeed', 'VideosFeed', 'ImagesFeed', 'ShortsFeed'] as const;

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');
const feedSource = (name: string) => read(`../components/app/feeds/${name}.tsx`);

describe('feed filter row edge fade', () => {
  it('never paints a solid strip over the filter rows', () => {
    // A painted `from-black` strip has to match the surface it sits on. The
    // filter panel is portalled into the zinc-900 feed nav on mobile, where the
    // strip read as a black box, and it would be an outright black bar in a
    // light theme. The row is masked instead, so it has no colour of its own.
    for (const feed of FEEDS) {
      expect(feedSource(feed)).not.toMatch(/from-black to-transparent/);
    }
  });

  it('fades overflowing edges by masking the scrolling row', () => {
    const row = read('../components/app/feeds/GlassFilterRow.tsx');
    expect(row).toContain('useScrollFadeMask');
    expect(row).toContain("style={{ touchAction: 'pan-x', ...fadeStyle }}");

    const hook = read('../components/app/feeds/useScrollFadeMask.ts');
    // Only the side with hidden content is faded, so a row that fits — or one
    // scrolled to its end — is never clipped.
    expect(hook).toContain('maskImage');
    expect(hook).toContain('WebkitMaskImage');
    expect(hook).toMatch(/if \(!enabled \|\| \(!edges\.start && !edges\.end\)\) return undefined;/);
  });
});

describe('feed filter reset button', () => {
  it('sits above the filter rows so the tap reaches it', () => {
    // The rows are z-40 and overlap the reset button's corner; without a higher
    // z-index the row swallows the click and the filters never reset.
    for (const feed of FEEDS) {
      const source = feedSource(feed);
      const resetButtons = source.match(/className="absolute[^"]*p-1\.5 rounded-lg text-zinc-500[^"]*"/g) ?? [];
      expect(resetButtons.length).toBeGreaterThan(0);
      for (const button of resetButtons) {
        expect(button).toContain('z-50');
      }
    }
  });
});
