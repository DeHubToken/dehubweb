/**
 * Random Feed Hook
 * =================
 * Fetches truly random posts by generating random post IDs and fetching them individually.
 * This ensures randomness across the entire database (2600+ posts), not just recent ones.
 * 
 * @module hooks/use-random-feed
 */

import { useState, useCallback, useRef } from 'react';
import { getNFTInfo, type DeHubNFT } from '@/lib/api/dehub';

const DEHUB_API_BASE = "https://api.dehub.io";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Number of random posts to fetch per batch */
const RANDOM_BATCH_SIZE = 30;

/** Fallback total count if API doesn't return it */
const FALLBACK_TOTAL_COUNT = 2600;

/** How many extra IDs to generate to account for failed/missing posts */
const OVERFETCH_RATIO = 1.3;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Fetch total post count from the unified feed API
 */
async function fetchTotalCount(): Promise<number> {
  try {
    const response = await fetch(`${DEHUB_API_BASE}/api/feed?page=1&limit=1&status=minted`);
    if (!response.ok) return FALLBACK_TOTAL_COUNT;
    
    const data = await response.json();
    return data.pagination?.totalCount || FALLBACK_TOTAL_COUNT;
  } catch {
    return FALLBACK_TOTAL_COUNT;
  }
}

/**
 * Generate unique random integers between 1 and max (inclusive)
 */
function generateRandomIds(count: number, max: number): number[] {
  const ids = new Set<number>();
  const attempts = count * 3; // Prevent infinite loop
  let i = 0;
  
  while (ids.size < count && i < attempts) {
    const id = Math.floor(Math.random() * max) + 1;
    ids.add(id);
    i++;
  }
  
  return Array.from(ids);
}

// ============================================================================
// HOOK
// ============================================================================

export interface UseRandomFeedOptions {
  batchSize?: number;
  enabled?: boolean;
}

export interface UseRandomFeedResult {
  posts: DeHubNFT[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  totalCount: number;
}

/**
 * Hook to fetch truly random posts from the entire database
 */
export function useRandomFeed(options: UseRandomFeedOptions = {}): UseRandomFeedResult {
  const { batchSize = RANDOM_BATCH_SIZE, enabled = true } = options;
  
  const [posts, setPosts] = useState<DeHubNFT[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [totalCount, setTotalCount] = useState(FALLBACK_TOTAL_COUNT);
  const [hasMore, setHasMore] = useState(true);
  
  // Track fetched IDs to avoid duplicates across load more calls
  const fetchedIdsRef = useRef<Set<number>>(new Set());
  const isInitializedRef = useRef(false);

  /**
   * Fetch a batch of random posts by ID
   */
  const fetchRandomBatch = useCallback(async (append: boolean = false): Promise<void> => {
    if (!enabled) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Get total count on first fetch
      let currentTotalCount = totalCount;
      if (!isInitializedRef.current) {
        currentTotalCount = await fetchTotalCount();
        setTotalCount(currentTotalCount);
        isInitializedRef.current = true;
      }
      
      // Generate more IDs than needed to account for failures
      const idsToGenerate = Math.ceil(batchSize * OVERFETCH_RATIO);
      let randomIds: number[];
      
      if (append) {
        // For load more, exclude already fetched IDs
        const availableIds: number[] = [];
        for (let id = 1; id <= currentTotalCount; id++) {
          if (!fetchedIdsRef.current.has(id)) {
            availableIds.push(id);
          }
        }
        
        // Check if we've fetched most of the database
        if (availableIds.length < batchSize / 2) {
          setHasMore(false);
          setIsLoading(false);
          return;
        }
        
        // Shuffle and pick random IDs from available
        const shuffled = availableIds.sort(() => Math.random() - 0.5);
        randomIds = shuffled.slice(0, idsToGenerate);
      } else {
        // For initial/refresh, reset everything
        fetchedIdsRef.current = new Set();
        randomIds = generateRandomIds(idsToGenerate, currentTotalCount);
      }
      
      // Fetch all posts in parallel
      const results = await Promise.allSettled(
        randomIds.map(id => getNFTInfo(String(id)))
      );
      
      // Filter successful fetches and minted posts
      const successfulPosts = results
        .filter((r): r is PromiseFulfilledResult<DeHubNFT> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(post => post && post.status === 'minted' && post.tokenId);
      
      // Track fetched IDs
      successfulPosts.forEach(post => {
        fetchedIdsRef.current.add(post.tokenId);
      });
      
      // Limit to batch size and shuffle for variety
      const finalPosts = successfulPosts
        .sort(() => Math.random() - 0.5)
        .slice(0, batchSize);
      
      if (append) {
        setPosts(prev => [...prev, ...finalPosts]);
      } else {
        setPosts(finalPosts);
      }
      
      // Update hasMore based on how many we've fetched vs total
      setHasMore(fetchedIdsRef.current.size < currentTotalCount * 0.8);
      
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch random posts'));
    } finally {
      setIsLoading(false);
    }
  }, [enabled, batchSize, totalCount]);

  /**
   * Refresh the feed with new random posts
   */
  const refetch = useCallback(async (): Promise<void> => {
    isInitializedRef.current = false;
    await fetchRandomBatch(false);
  }, [fetchRandomBatch]);

  /**
   * Load more random posts
   */
  const loadMore = useCallback(async (): Promise<void> => {
    if (isLoading || !hasMore) return;
    await fetchRandomBatch(true);
  }, [fetchRandomBatch, isLoading, hasMore]);

  return {
    posts,
    isLoading,
    error,
    refetch,
    loadMore,
    hasMore,
    totalCount,
  };
}
