

# Speed Up Home Feed Loading

## Problem
When an authenticated user opens the home feed, the app **completely skips** the server-side cache (`feed_cache` table) and hits the external DeHub API directly every time. This was done intentionally to get personalized data (isLiked, isDisliked, isUnlocked), but it means the first load is always slow — typically 1-3 seconds waiting on the external API.

## Solution: Cache-First, Then Personalize

Use the server-side cache as **instant placeholder data** for all users (including authenticated), then silently refresh with personalized data in the background. Users see content in under 200ms, and personalized states (like/dislike indicators) update seamlessly moments later.

```text
Current Flow (Slow):
User opens feed --> Wait for DeHub API (1-3s) --> Show content

New Flow (Fast):
User opens feed --> Show cached content instantly (~100ms)
                --> Refresh from API in background (~1-3s)
                --> Merge personalized data (seamless update)
```

## Changes

### 1. Use cache as placeholder for authenticated users (`use-unified-feed.ts`)
- Remove the `if (!token)` guard that blocks authenticated users from using the cache
- Change `fetchUnifiedFeed` to **always** check the cache first
- If cache exists, return it immediately as placeholder data
- Then trigger a background API call for personalized data
- This is achieved by using React Query's `placeholderData` or `initialData` with the cached feed

### 2. Add client-side cache layer (`use-unified-feed.ts`)
- Store the last successful API response in `sessionStorage` (keyed by feed params)
- On next load, use this as instant data while the API call is in flight
- This covers the case where the server-side `feed_cache` might be stale or miss

### 3. Optimize the prefetch to warm cache on app start (`use-feed-prefetch.ts`)
- Move the home feed prefetch to trigger **immediately on app mount** (not after home feed loads)
- This way, by the time the user navigates to the home tab, data is already cached in React Query

## Technical Details

The key change in `fetchUnifiedFeed`:

```typescript
// Before: authenticated users ALWAYS skip cache
async function fetchUnifiedFeed(params) {
  const token = getAuthToken();
  if (!token) {
    // only guests use cache
  }
  return fetchUnifiedFeedFromAPI(params);
}

// After: everyone gets cache-first, API refresh in background
async function fetchUnifiedFeed(params) {
  // Try cache first for ALL users (instant load)
  const cacheKey = getCacheKey(params);
  if (cacheKey) {
    const cached = await fetchCachedFeed(cacheKey);
    if (cached) return cached;
  }
  // Fallback to API
  return fetchUnifiedFeedFromAPI(params);
}
```

Then in the `useUnifiedFeed` hook, set `staleTime: 0` so React Query immediately triggers a background refetch after showing the cached data. The personalized fields (isLiked, isDisliked, isUnlocked) will update in-place without a loading flash thanks to the existing `placeholderData` pattern.

The PPV purchase enrichment (lines 553-560) will still apply on the background refetch, so unlock states remain accurate.

### Risk Mitigation
- Like/dislike icons may briefly show the wrong state (from non-personalized cache) before the background refresh completes — this is a standard stale-while-revalidate tradeoff and is acceptable for a ~2s window
- The existing vote cache (`vote-cache.ts`) already handles optimistic updates, so any recent user votes will be correct immediately

