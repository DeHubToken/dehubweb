import { describe, expect, it } from 'vitest';
import { isFirstVisibleFeedCard } from '../lib/feed-first-card';

describe('first card after publishing', () => {
  const firsts = (pending: number, pinned: boolean) => [
    ...Array.from({ length: pending }, (_, index) => ['optimistic', index] as const),
    ...(pinned ? [['pinned', 0] as const] : []),
    ['feed', 0] as const, ['feed', 1] as const,
  ].filter(([section, index]) => isFirstVisibleFeedCard(section, index, pending, pinned));
  it('gives the newly published video first-card layout without duplicating it on the old first post', () => {
    expect(firsts(2, true)).toEqual([['optimistic', 0]]);
    expect(firsts(1, false)).toEqual([['optimistic', 0]]);
  });
  it('hands first-card layout back after server reconciliation', () => {
    expect(firsts(0, false)).toEqual([['feed', 0]]);
    expect(firsts(0, true)).toEqual([['pinned', 0]]);
  });
});
