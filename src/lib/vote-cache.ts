/**
 * Vote Cache
 * ==========
 * Global in-memory store for recent votes so optimistic UI
 * survives page navigations (new component mounts).
 * Entries auto-expire after 30 seconds.
 */

interface VoteCacheEntry {
  isLiked: boolean;
  isDisliked: boolean;
  likeCount: number;
  dislikeCount: number;
  timestamp: number;
}

const cache = new Map<string, VoteCacheEntry>();
const TTL = 30_000; // 30 seconds

export function setVoteCache(
  postId: string,
  state: Omit<VoteCacheEntry, 'timestamp'>,
): void {
  cache.set(postId, { ...state, timestamp: Date.now() });
}

export function getVoteCache(postId: string): Omit<VoteCacheEntry, 'timestamp'> | null {
  const entry = cache.get(postId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL) {
    cache.delete(postId);
    return null;
  }
  const { timestamp: _, ...state } = entry;
  return state;
}

export function clearVoteCache(postId: string): void {
  cache.delete(postId);
}
