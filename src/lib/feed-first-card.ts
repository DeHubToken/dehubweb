/** First-card layout follows the visible order, including freshly published posts. */
export function isFirstVisibleFeedCard(
  section: 'optimistic' | 'pinned' | 'feed',
  index: number,
  optimisticCount: number,
  hasPinned: boolean,
): boolean {
  if (index !== 0) return false;
  if (section === 'optimistic') return optimisticCount > 0;
  if (optimisticCount > 0) return false;
  return section === 'pinned' ? hasPinned : !hasPinned;
}
