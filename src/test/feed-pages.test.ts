import { describe, it, expect } from 'vitest';
import { flattenFeedPages } from '@/lib/feed-pages';

describe('flattenFeedPages', () => {
  it('shows a post once when two pages both return it', () => {
    // The shape production produces: /api/feed pages by offset, so a post
    // published mid-scroll pushes the boundary and page 2 repeats page 1's
    // last row.
    const pages = [
      { items: [{ tokenId: 1 }, { tokenId: 2 }, { tokenId: 3 }] },
      { items: [{ tokenId: 3 }, { tokenId: 4 }] },
    ];

    expect(flattenFeedPages(pages).map((p) => p.tokenId)).toEqual([1, 2, 3, 4]);
  });

  it('keeps the first copy, so the row does not jump position', () => {
    const pages = [
      { items: [{ tokenId: 7, title: 'first' }] },
      { items: [{ tokenId: 7, title: 'second' }] },
    ];

    const out = flattenFeedPages(pages);

    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('first');
  });

  it('treats tokenId and id as the same identity', () => {
    const pages = [{ items: [{ id: 5 }, { tokenId: 5 }] }];

    expect(flattenFeedPages(pages)).toHaveLength(1);
  });

  it('matches ids that differ only by type or padding', () => {
    const pages = [{ items: [{ tokenId: 12 }, { tokenId: '12' }, { tokenId: ' 12 ' }] }];

    expect(flattenFeedPages(pages)).toHaveLength(1);
  });

  it('does not collapse rows that have no id of their own', () => {
    // Carousel inserts and ads ride the same list without a tokenId; they must
    // not all fold into a single row.
    const pages = [{ items: [{ kind: 'ad' }, { kind: 'ad' }, { tokenId: null }] }];

    expect(flattenFeedPages(pages as never)).toHaveLength(3);
  });

  it('survives empty, null and missing pages', () => {
    expect(flattenFeedPages(undefined)).toEqual([]);
    expect(flattenFeedPages(null)).toEqual([]);
    expect(flattenFeedPages([{ items: null }, {}])).toEqual([]);
  });
});
