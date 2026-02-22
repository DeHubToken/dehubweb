
## Fix: Home Feed Loading Slower Than Video Feed

### Root Cause

The home feed is slower because of the **Supabase cache race strategy** in `fetchUnifiedFeed`. For authenticated users, when the home feed loads (postType = "all", sortBy = "createdAt"), the code:

1. Starts a Supabase database query to `feed_cache` table
2. Starts the DeHub API call
3. Waits up to **2 seconds** for the Supabase cache to resolve before falling back to the API

If the Supabase cache misses (stale, empty, or slow), this adds up to 2 seconds of latency before the API result is used.

Meanwhile, the **video feed skips all caching** because the `getCacheKey` function returns `null` for any `postType` that isn't `'all'`. So the video feed goes directly to the DeHub API with zero overhead -- making it appear almost instant.

### The Fix

Two changes to `src/hooks/use-unified-feed.ts`:

1. **Reduce the cache timeout from 2 seconds to 500ms** -- If the Supabase cache doesn't respond in 500ms, it's not helping. Fall through to the API result immediately.

2. **Use the cache as `placeholderData` instead of blocking** -- Instead of awaiting the cache race, fire both requests and return whichever resolves first. If the cache wins, use it; if the API wins, use that directly. This way the cache never adds latency, it can only make things faster.

### Technical Details

**File: `src/hooks/use-unified-feed.ts`**

In the `fetchUnifiedFeed` function (around line 459), change the authenticated user path:

- Current: Races cache (2s timeout) vs nothing, then falls back to API if cache misses
- New: Race cache (500ms timeout) vs API directly. Whichever resolves first wins. The cache can only help, never hurt.

```text
Current flow:
  cache (2s timeout) --> if miss --> await API
  Total worst case: 2s + API time

New flow:
  Promise.race(cache (500ms timeout), API)
  Total worst case: API time (cache never adds delay)
```

Also in `useNebulaPrefetch`, the prefetched home feed data should be hitting the TanStack Query cache directly, so the Supabase cache race shouldn't even trigger for prefetched data. We should verify the prefetch query keys match exactly (the plan.md identified this issue -- ensure `postType: undefined` and `followingOnly: undefined` are both present).
