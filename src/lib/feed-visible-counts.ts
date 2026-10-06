/** Read current cards when a scheduled poll fires, without polling on scroll. */
export function visibleFeedTokenIds(): number[] {
  if (typeof document === 'undefined') return [];
  const ids = new Set<number>();
  for (const card of document.querySelectorAll<HTMLElement>('[data-feed-root] [data-feed-token-id]')) {
    const box = card.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0 || box.bottom <= 0 || box.top >= window.innerHeight
      || box.right <= 0 || box.left >= window.innerWidth) continue;
    const id = Number(card.dataset.feedTokenId);
    if (Number.isSafeInteger(id) && id > 0) ids.add(id);
    if (ids.size >= 20) break;
  }
  return [...ids];
}
