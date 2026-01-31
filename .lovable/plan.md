

# True Random Feed Implementation

## Problem Summary

The current "Random" sort mode pre-fetches 5 pages of the **most recent** content (100 items from pages 1-5) and shuffles them. This means:
- You only ever see the newest ~100 posts shuffled
- Older high-quality content from the 2600+ total posts is never shown
- It's not truly random across the entire database

## Solution: Random Post ID Selection

Since we know:
1. Post IDs (tokenId) range from 1 to ~2600+
2. We have `getNFTInfo(tokenId)` to fetch any single post by ID
3. The `/api/feed` returns `pagination.totalCount` telling us the exact count

We can implement **true randomness** by:
1. Generate random post IDs within the valid range
2. Fetch those specific posts directly by ID
3. Display a genuinely random selection from the entire history

## Technical Changes

### File: `src/components/app/feeds/HomeFeed.tsx`

**New Approach for Random Mode:**

1. **Get total count first** - Make one API call to get `totalCount` from pagination
2. **Generate random IDs** - Pick N random numbers between 1 and totalCount
3. **Batch fetch posts** - Use `Promise.all` with `getNFTInfo` for each ID
4. **Handle missing posts** - Some IDs may not exist (deleted/failed mints), filter those out

```typescript
// Constants
const RANDOM_BATCH_SIZE = 30; // Number of random posts to fetch

// New state for random mode
const [randomPosts, setRandomPosts] = useState<UnifiedFeedItem[]>([]);
const [isLoadingRandom, setIsLoadingRandom] = useState(false);

// Fetch random posts by ID
async function fetchRandomPosts(totalCount: number): Promise<void> {
  setIsLoadingRandom(true);
  
  // Generate unique random IDs
  const randomIds = new Set<number>();
  while (randomIds.size < RANDOM_BATCH_SIZE) {
    const id = Math.floor(Math.random() * totalCount) + 1;
    randomIds.add(id);
  }
  
  // Fetch all posts in parallel
  const results = await Promise.allSettled(
    Array.from(randomIds).map(id => getNFTInfo(String(id)))
  );
  
  // Filter successful fetches and map to feed format
  const posts = results
    .filter((r): r is PromiseFulfilledResult<DeHubNFT> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter(post => post && post.status === 'minted'); // Only show minted posts
  
  setRandomPosts(posts);
  setIsLoadingRandom(false);
}
```

**Integration with existing feed:**

When `selectedSort.value === 'random'`:
- Skip the standard `useUnifiedFeed` pagination approach
- Use the random ID fetching instead
- On pull-to-refresh, generate new random IDs

### File: `src/hooks/use-unified-feed.ts`

**Add helper to get total count:**

```typescript
export async function getFeedTotalCount(): Promise<number> {
  const response = await fetchUnifiedFeed({ page: 1, limit: 1 });
  return response.pagination?.totalCount || 2600; // Fallback
}
```

## Advantages

1. **True randomness** - Content from any time period can appear
2. **Better content discovery** - Old high-engagement posts surface again
3. **Single loading state** - No more sequential page fetching causing reflows
4. **Fresh every time** - Each refresh generates completely new random IDs

## Trade-offs

- Slightly slower initial load (30 parallel API calls vs 1 paginated call)
- Some random IDs may not exist, reducing actual items shown
- Network usage is higher but still reasonable

## Alternative: Random Page Offsets

If individual ID fetching is too slow, we could instead:
- Fetch 5 random page numbers (e.g., pages 7, 23, 45, 89, 112 instead of 1-5)
- This gives variety from different time periods
- Simpler to implement, less API calls

Let me know which approach you prefer:
1. **Random IDs** (truly random, more API calls)
2. **Random Pages** (varied but not true random, fewer API calls)

