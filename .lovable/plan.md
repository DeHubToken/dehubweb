

# Fix: API Rate Limiting (429s) from Excessive Prefetching

## Root Cause

The app is firing **10-15+ simultaneous `/api/feed` requests** on every page load, triggering 429 (Too Many Requests) from the DeHub API. This breaks feed loading, which means no videos or avatars appear.

**Request flood breakdown:**
1. **Nebula prefetch** (`use-nebula-prefetch.ts`): On first user interaction, fires **5 parallel requests** (video, feed-images, feed-simple, video again for scroll, unified home feed)
2. **Then 1.5s later**, it calls `prefetchAllFeeds` which fires **another 5 requests** (videos, images, shorts, music, live)
3. **Then** `useFeedPrefetch` in `HomePage.tsx` fires `prefetchAllFeeds` **again** with `PREFETCH_DELAY_MS = 0` (immediately)
4. **Then** the actual feed component fires its own query

That's up to **15+ API calls** within seconds, to the same endpoint. The DeHub API throttler rejects them with 429, causing "Unable to load feed" and "Video unavailable".

## Fix

### 1. `src/hooks/use-nebula-prefetch.ts`
- Remove the duplicate `prefetchAllFeeds` call at line 158 (setTimeout 1.5s). The nebula prefetch already caches all the home feed queries — calling `prefetchAllFeeds` again is redundant
- Reduce from 5 parallel requests to 3: remove the duplicate video fetch for scroll carousel (it's the same data, just sliced)

### 2. `src/hooks/use-feed-prefetch.ts`  
- Change `PREFETCH_DELAY_MS` from `0` to `3000` (3 seconds) to avoid overlapping with nebula prefetch or actual feed loads
- Add a check: skip prefetching if the nebula prefetch already ran (check `PREFETCH_TRIGGERED_KEY` from session storage)
- This prevents double-firing `prefetchAllFeeds`

### 3. `src/hooks/use-unified-feed.ts`
- Add `staleTime: 2 * 60 * 1000` to the feed query so it uses cached data from prefetch instead of re-fetching immediately

## Impact
- Reduces simultaneous API calls from ~15 to ~4-5
- Eliminates 429 errors, so feed loads reliably
- Videos and avatars display correctly since the feed data actually arrives

