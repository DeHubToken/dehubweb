
# Plan: Fix Duration Filter Showing Limited Results

## Problem Identified

The duration filter (4-20min, etc.) only shows 1 video when there should be more because:

1. **The API doesn't support server-side duration filtering** - The DeHub `/api/feed` endpoint has no `minDuration` or `maxDuration` parameters
2. **Client-side filtering on small dataset** - Only 12 videos are fetched per page, then filtered
3. **No automatic pagination** - When filter reduces 12 to 1, the system doesn't fetch more pages to compensate

### Example Flow
- User selects "4-20 min" filter
- API returns 12 videos (page 1)
- Only 1 of those 12 is 4-20 minutes long
- User sees 1 video (other matching videos are on pages 2, 3, 4...)

---

## Solution: Auto-Load More When Filtered Results Are Low

We'll modify the `VideosFeed.tsx` component to automatically fetch additional pages when the client-side duration filter results in too few videos.

### Technical Approach

1. **Add a `useEffect` to monitor filtered results** - When duration filter is active and visible videos count is below a threshold, auto-trigger `fetchNextPage`
2. **Use a loading state** - Show skeleton/loading while fetching additional pages to fill the view
3. **Set reasonable limits** - Stop auto-fetching after a certain number of pages to prevent infinite loops

---

## File Changes

### `src/components/app/feeds/VideosFeed.tsx`

**Change 1: Add auto-fetch logic when duration filter results in few items**

After the `videos` useMemo (around line 462), add:

```typescript
// Auto-fetch more pages when duration filter reduces visible items below threshold
const MIN_VISIBLE_VIDEOS = 8;
const MAX_AUTO_FETCH_ATTEMPTS = 5;
const autoFetchAttempts = useRef(0);

useEffect(() => {
  // Only auto-fetch if:
  // 1. Duration filter is active (not "Any")
  // 2. We have fewer than MIN_VISIBLE_VIDEOS
  // 3. There are more pages to fetch
  // 4. We haven't exceeded max attempts
  // 5. We're not already fetching
  const isDurationFilterActive = selectedDuration.min !== 0 || selectedDuration.max !== Infinity;
  
  if (
    isDurationFilterActive &&
    videos.length < MIN_VISIBLE_VIDEOS &&
    hasNextPage &&
    autoFetchAttempts.current < MAX_AUTO_FETCH_ATTEMPTS &&
    !isFetchingNextPage &&
    !isApiLoading
  ) {
    console.log(`[VideosFeed] Auto-fetching more pages. Current: ${videos.length} videos, need ${MIN_VISIBLE_VIDEOS}`);
    autoFetchAttempts.current += 1;
    fetchNextPage();
  }
  
  // Reset attempts when filter changes
  if (!isDurationFilterActive) {
    autoFetchAttempts.current = 0;
  }
}, [videos.length, selectedDuration, hasNextPage, isFetchingNextPage, isApiLoading, fetchNextPage]);

// Reset auto-fetch attempts when duration filter changes
useEffect(() => {
  autoFetchAttempts.current = 0;
}, [selectedDuration]);
```

**Change 2: Show loading indicator while auto-fetching**

Update the empty state check to account for ongoing auto-fetch:

```typescript
// Show loading if we're auto-fetching to fill the view
const isAutoFetching = 
  (selectedDuration.min !== 0 || selectedDuration.max !== Infinity) &&
  videos.length < MIN_VISIBLE_VIDEOS &&
  isFetchingNextPage;

// In the render section, before the empty state:
if (isAutoFetching) {
  return <VideosFeedSkeleton />;
}
```

---

## How This Fixes the Issue

1. User selects "4-20 min" filter
2. API returns 12 videos (page 1), filtered to 1 video
3. Auto-fetch effect detects: 1 < 8 (threshold), `hasNextPage = true`
4. Automatically calls `fetchNextPage()` → fetches page 2
5. Now has 24 videos total, filtered might show 3-4
6. Still < 8? Fetches page 3, 4, 5 (up to MAX_AUTO_FETCH_ATTEMPTS)
7. User sees up to 8+ matching videos

---

## Expected Outcome

- Duration filter will show more matching videos by automatically fetching additional pages
- Maximum 5 additional page fetches to prevent infinite loading
- Loading skeleton shown while auto-fetching
- Once enough videos are found (8+) or max attempts reached, stops fetching
