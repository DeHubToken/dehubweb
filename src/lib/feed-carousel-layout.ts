import { SHORTS_FIRST_POST, SHORTS_LEAD_POST, shortsBatchIndex } from './shorts-rotation';

/** Finish the opening masonry row before a full-width reel breaks the feed. */
export function homeReelBatchIndex(posts: number, columns: number, totalPosts: number): number {
  const lead = Math.min(Math.max(1, columns), Math.max(1, totalPosts), SHORTS_FIRST_POST - 1);
  if (posts === lead) return 0;
  return posts === SHORTS_LEAD_POST ? -1 : shortsBatchIndex(posts);
}

/** Leave two organic posts after the next reel before suggesting accounts. */
export function homeSuggestedAfter(columns: number): number {
  return columns > 1 ? SHORTS_FIRST_POST + 2 : 3;
}
