

## Fix: Home Feed Slow Load for Authenticated Users

### Root Cause

The home feed is the **only feed that is NOT prefetched**. The `useFeedPrefetch` hook prefetches Videos, Images, Shorts, Music, and Live tabs -- but never the home feed itself. Meanwhile, authenticated users always bypass the database cache (`feed_cache` table) and hit the DeHub API directly on every page load.

So the home feed always waits for a cold API call to `api.dehub.io/api/feed` before showing anything. Every other page appears fast because either it's prefetched or it uses lazy loading with cached data.

### The Fix

Two changes to make the home feed load instantly:

**1. Add home feed to the prefetcher (`src/hooks/use-feed-prefetch.ts`)**

Add a new parallel fetch for the home feed (Latest, page 1, no postType filter) inside `prefetchAllFeeds()`. Populate the React Query cache with the correct key so the `useUnifiedFeed` hook picks it up immediately without making another API call.

The query key must match exactly: `['unified-feed', { sortBy: 'createdAt', sortOrder: 'desc', status: 'minted', ... }, 20]`

**2. Use cached data as placeholder for authenticated users (`src/hooks/use-unified-feed.ts`)**

Currently authenticated users completely skip the `feed_cache` table. Instead of skipping it, use the cached data as **immediate placeholder data** while the personalized API call runs in the background. This way users see content instantly, and it gets enriched with their like/unlock status moments later when the API responds.

Change `fetchUnifiedFeed()`:
- For authenticated users on page 1 of cacheable feeds: start both the cache read and the API call in parallel
- Return the API result (personalized), but if the cache resolves first, use it as initial data via TanStack Query's `placeholderData`

### Technical Details

**File: `src/hooks/use-feed-prefetch.ts`**
- Add `homeFeedPromise` calling the unified feed API with `{ limit: 20, sortBy: 'createdAt', sortOrder: 'desc', status: 'minted' }`
- Include it in `Promise.allSettled`
- Populate cache with key `['unified-feed', { sortBy: 'createdAt', sortOrder: 'desc', range: undefined, isPPV: undefined, hasBounty: undefined, isLocked: undefined, status: 'minted', category: undefined, followingOnly: undefined }, 20]`

**File: `src/hooks/use-unified-feed.ts`**
- In `fetchUnifiedFeed()`: for authenticated users on page 1 with a valid cache key, race the cache read (with 2s timeout) against the API call
- If cache wins, return cache data immediately (the API will still populate on next background refetch thanks to `staleTime`)
- If API wins, return API data as normal

This ensures authenticated users see feed content within milliseconds (from cache or prefetch) while still getting personalized data.

