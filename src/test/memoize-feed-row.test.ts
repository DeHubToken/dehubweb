import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoizeFeedRow } from '../lib/memoize-feed-row';

afterEach(() => vi.useRealTimers());

describe('feed card props during pagination', () => {
  it('reuses existing card props when another page arrives', () => {
    const map = vi.fn((row: { id: number }, index: number) => ({ ...row, index }));
    const cached = memoizeFeedRow(map);
    const firstPage = [{ id: 1 }, { id: 2 }];
    const first = firstPage.map(cached);
    const appended = [...firstPage, { id: 3 }].map(cached);
    expect(appended[0]).toBe(first[0]);
    expect(appended[1]).toBe(first[1]);
    expect(map).toHaveBeenCalledTimes(3);
  });

  it('updates changed data, moved rows and aging timestamps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const cached = memoizeFeedRow((row: { likes: number }, index: number) => ({ ...row, index, time: Date.now() }));
    const row = { likes: 1 };
    const first = cached(row, 0);
    expect(cached({ likes: 2 }, 0).likes).toBe(2);
    expect(cached(row, 1).index).toBe(1);
    vi.setSystemTime(60_000);
    expect(cached(row, 0)).not.toBe(first);
    expect(cached(row, 0).time).toBe(60_000);
  });
});
