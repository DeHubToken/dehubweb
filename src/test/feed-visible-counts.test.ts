import { afterEach, expect, it, vi } from 'vitest';
import { visibleFeedTokenIds } from '@/lib/feed-visible-counts';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });
it('reads only visible cards, deduplicates IDs and ignores hidden, sponsored and invalid rows', () => {
  document.body.innerHTML = '<div data-feed-root><div data-feed-token-id="25"></div><div data-feed-token-id="25"></div>'
    + '<div data-feed-token-id="26"></div><div data-feed-token-id="27"></div><div data-feed-token-id="temp-1"></div>'
    + '<div data-feed-item></div></div>';
  const cards = document.querySelectorAll<HTMLElement>('[data-feed-token-id]');
  cards.forEach((card, index) => vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({
    top: index === 2 ? -300 : 10, bottom: index === 2 ? -10 : 100,
    left: 0, right: 100, width: index === 3 ? 0 : 100, height: 90,
  } as DOMRect));
  expect(visibleFeedTokenIds()).toEqual([25]);
});

it('caps the viewport set at twenty counters', () => {
  document.body.innerHTML = '<div data-feed-root>' + Array.from({ length: 30 }, (_, i) => `<div data-feed-token-id="${i + 1}"></div>`).join('') + '</div>';
  document.querySelectorAll('[data-feed-token-id]').forEach(card => vi.spyOn(card, 'getBoundingClientRect')
    .mockReturnValue({ top: 0, bottom: 10, left: 0, right: 10, width: 10, height: 10 } as DOMRect));
  expect(visibleFeedTokenIds()).toHaveLength(20);
});
