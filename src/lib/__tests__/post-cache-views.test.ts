/**
 * The count a post shows when you open it from the feed.
 *
 * Feed items carry counts already formatted ("15.4K"), and the navigation cache
 * converts a feed item back into an API-shaped post so the page can render
 * before the real fetch lands. It used to do that with `parseInt`, which stops
 * at the first non-digit — so a post with 15,420 views seeded the shell with 15
 * and painted "15 views" until the fetch corrected it.
 */
import { describe, it, expect } from 'vitest';
import { formatCount, formatViews, parseFormattedCount } from '@/lib/feed-utils';
import { resolveViewCount } from '@/lib/engagement';

describe('parseFormattedCount', () => {
  it('reads back a K suffix instead of stopping at it', () => {
    expect(parseFormattedCount('15.4K')).toBe(15_400);
    expect(parseFormattedCount('1.2K views')).toBe(1_200);
  });

  it('reads back an M suffix', () => {
    expect(parseFormattedCount('2.5M')).toBe(2_500_000);
    expect(parseFormattedCount('2.5M views')).toBe(2_500_000);
  });

  it('handles plain counts, with and without the word', () => {
    expect(parseFormattedCount('342')).toBe(342);
    expect(parseFormattedCount('342 views')).toBe(342);
    expect(parseFormattedCount('0 views')).toBe(0);
  });

  it('passes a number straight through', () => {
    expect(parseFormattedCount(15_420)).toBe(15_420);
  });

  it('is 0 for nothing usable', () => {
    expect(parseFormattedCount(undefined)).toBe(0);
    expect(parseFormattedCount(null)).toBe(0);
    expect(parseFormattedCount('')).toBe(0);
    expect(parseFormattedCount('nonsense')).toBe(0);
  });

  it('round-trips every formatter to the same string', () => {
    // The point of the parse: it is lossy only to the precision the string had
    // already dropped, so the seeded shell and the card render identically and
    // the count does not visibly change when the real fetch lands.
    for (const count of [0, 7, 342, 999, 1_000, 15_420, 999_999, 2_500_000]) {
      expect(formatViews(parseFormattedCount(formatViews(count)))).toBe(formatViews(count));
      expect(formatCount(parseFormattedCount(formatCount(count)))).toBe(formatCount(count));
    }
  });

  it('seeds the field resolveViewCount actually reads', () => {
    // Seeded onto totalViews, not views: resolveViewCount prefers totalViews,
    // so seeding `views` would be shadowed the moment the API sends both.
    const seeded = { totalViews: parseFormattedCount('15.4K') };
    expect(resolveViewCount(seeded)).toBe(15_400);
  });
});
