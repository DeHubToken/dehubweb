
# Fix: True Parallel Feed Prefetching

## Root Cause Analysis

From the network logs, the feed requests are clearly **sequential**:
- **09:20:29Z** - Videos feed prefetch
- **09:20:31Z** - Images feed prefetch (2 seconds later!)

Even though the code uses `Promise.allSettled`, the actual HTTP requests fire one after another. This is because `queryClient.prefetchInfiniteQuery` may internally await or schedule queries, causing them to execute in sequence rather than truly parallel.

## Solution: Fire All Fetch Calls in Parallel First

Instead of relying on `prefetchInfiniteQuery` to run in parallel, we'll:
1. **Fire all raw fetch calls immediately in parallel** using `Promise.all`
2. **Then populate the React Query cache** with the results

This ensures the browser sends all HTTP requests simultaneously.

## Implementation

### File: `src/hooks/use-feed-prefetch.ts`

**Restructure `prefetchAllFeeds` to fetch data first, then populate cache:**

```typescript
async function prefetchAllFeeds(
  queryClient: ReturnType<typeof useQueryClient>, 
  walletAddress: string | null
) {
  console.log('[Prefetch] Starting PARALLEL feed prefetch');
  
  // 1. FIRE ALL FETCH CALLS IN PARALLEL
  // These promises start their HTTP requests immediately
  const videosFetchPromise = fetchUnifiedFeed({
    postType: 'video',
    limit: 12,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    status: 'minted',
    address: walletAddress || undefined,
  });
  
  const imagesFetchPromise = searchNFTs({
    unit: 12,
    sortMode: 'new',
    postType: 'feed-images',
    status: 'minted',
    address: walletAddress || undefined,
    page: 0,
  });
  
  const shortsFetchPromise = searchNFTs({
    unit: 12,
    sortMode: 'new',
    status: 'minted',
    address: walletAddress || undefined,
    page: 0,
  });
  
  const musicFetchPromise = searchNFTs({
    category: 'Music',
    postType: 'video',
    unit: 10,
    page: 1,
    sortMode: 'new',
    address: walletAddress || undefined,
  });
  
  const liveFetchPromise = getLiveStreams({ 
    page: 0, 
    unit: 15, 
    sortMode: 'recent' 
  });
  
  // 2. WAIT FOR ALL TO COMPLETE (truly parallel!)
  const [
    videosResult, 
    imagesResult, 
    shortsResult, 
    musicResult, 
    liveResult
  ] = await Promise.allSettled([
    videosFetchPromise,
    imagesFetchPromise,
    shortsFetchPromise,
    musicFetchPromise,
    liveFetchPromise,
  ]);
  
  // 3. POPULATE REACT QUERY CACHE with results
  // Videos
  if (videosResult.status === 'fulfilled') {
    const response = videosResult.value;
    const videosParams = {
      postType: 'video' as const,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
      range: undefined,
      address: walletAddress || undefined,
      isPPV: undefined,
      hasBounty: undefined,
      isLocked: undefined,
      status: 'minted' as const,
    };
    queryClient.setQueryData(
      ['unified-feed', videosParams, 12], 
      {
        pages: [{
          items: response.result || [],
          pagination: response.pagination,
          page: 1,
        }],
        pageParams: [1],
      }
    );
  }
  
  // Images - similar pattern
  if (imagesResult.status === 'fulfilled') {
    const data = imagesResult.value.result || imagesResult.value.data || [];
    const imagesParams = {
      unit: 12,
      sortMode: 'new' as const,
      address: walletAddress || undefined,
      postType: 'feed-images' as const,
      status: 'minted' as const,
    };
    queryClient.setQueryData(
      ['dehub-feed', imagesParams],
      {
        pages: [{
          data, page: 0, has_more: data.length >= 12, total: data.length, unit: 12
        }],
        pageParams: [0],
      }
    );
  }
  
  // ... similar for Shorts, Music, Live
  
  console.log('[Prefetch] Complete - all feeds cached');
}
```

## Key Changes Summary

| Before | After |
|--------|-------|
| `prefetchInfiniteQuery` calls pushed to array | Raw `fetch` calls started immediately |
| Each query's `queryFn` awaited in sequence | All HTTP requests fire simultaneously |
| ~10 second total prefetch time | ~2-3 seconds total (parallel) |
| `Promise.allSettled` on prefetch promises | `Promise.allSettled` on raw fetch promises |
| Cache populated during prefetch | Cache populated with `setQueryData` after |

## Technical Details

### Why `setQueryData` Instead of `prefetchInfiniteQuery`

- `prefetchInfiniteQuery` internally manages async execution
- `setQueryData` directly writes to the cache synchronously
- The data format must match infinite query structure: `{ pages: [...], pageParams: [...] }`

### Query Key Matching (Critical!)

The query keys used in `setQueryData` must **exactly match** what the feed components use:

```typescript
// Videos: ['unified-feed', params, 12]
// Images: ['dehub-feed', { unit: 12, sortMode: 'new', ... }]
// Shorts: ['dehub-feed', { unit: 12, sortMode: 'new', ... }]
// Music:  ['music-videos-infinite', walletAddress]
// Live:   ['dehub-live', { unit: 15, sortMode: 'recent' }]
```

### Handling Authenticated vs Public Feeds

For logged-in users, we'll prefetch with `walletAddress` included. The query key will include the address, matching what the feed components use when a user is logged in.

## Expected Behavior After Fix

1. User opens app → HomePage mounts
2. Prefetch fires **5 HTTP requests simultaneously**
3. All requests complete in ~2-3 seconds (parallel)
4. Cache is populated with `setQueryData`
5. User clicks any tab → **Instant load from cache**

## Network Tab Verification

After this fix, you should see in the Network tab:
- All 5 feed requests starting at the **same time** (within 50ms of each other)
- Total prefetch time reduced from ~10s to ~2-3s
