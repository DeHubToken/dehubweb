import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every mapper that turns an API row into a feed item has to carry
 * `contentRating`.
 *
 * An absent rating reads as safe — `useMatureGate(undefined)` does not gate —
 * so a mapper that drops the field renders a mature post unblurred rather than
 * failing in a way anyone would notice. The unified and dehub feed mappers
 * carried it; the shared `nft-to-feed-item` used by community feeds and
 * notifications, and the bookmarks mappers, did not. Bookmark a mature image
 * from a profile where it was correctly blurred and it came back uncovered.
 *
 * Source-level because these are plain object literals with no shared
 * constructor to hang a runtime check on. If that changes, delete this and
 * assert on the constructor instead.
 */
const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/** Every file that builds a feed item from an API row. */
const MAPPERS = [
  'lib/nft-to-feed-item.ts',
  'hooks/use-bookmarks.ts',
  'hooks/use-dehub-feed.ts',
  'hooks/use-unified-feed.ts',
];

describe('content rating survives every mapper', () => {
  for (const file of MAPPERS) {
    it(`${file} carries contentRating on each shape it returns`, () => {
      const src = read(file);

      // One `type: 'video' | 'image' | 'post'` per returned shape. Every one of
      // them needs the rating alongside it.
      const shapes = src.match(/^\s*type: '(video|image|post)',$/gm) ?? [];
      expect(shapes.length).toBeGreaterThan(0);

      const ratings = src.match(/^\s*contentRating:/gm) ?? [];
      expect(
        ratings.length,
        `${file} returns ${shapes.length} feed shapes but sets contentRating ${ratings.length} times`,
      ).toBeGreaterThanOrEqual(shapes.length);
    });
  }
});
