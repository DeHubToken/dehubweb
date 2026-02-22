

## Fix: Home Feed Cache Key Mismatch

### Root Cause

The prefetcher is caching the home feed data under a query key that does NOT match what the home feed component actually uses. TanStack Query treats `{ postType: undefined }` and `{}` (missing key) as different cache entries, so the prefetched data is never found.

Here is the mismatch:

**What the home feed component uses (singleFeed query key):**
```
['unified-feed', {
  limit: 20,          // <-- included in params
  sortBy: 'createdAt',
  sortOrder: 'desc',
  status: 'minted',
  category: undefined,
  isPPV: undefined,
  hasBounty: undefined,
  isLocked: undefined,
  followingOnly: undefined,
  postType: undefined,  // <-- PRESENT as undefined
  range: undefined,
}, 20]
```

**What the prefetcher caches under:**
```
['unified-feed', {
  sortBy: 'createdAt',
  sortOrder: 'desc',
  status: 'minted',
  category: undefined,
  isPPV: undefined,
  hasBounty: undefined,
  isLocked: undefined,
  followingOnly: undefined,
  // postType is MISSING entirely
  range: undefined,
}, 20]
```

These keys are different objects to TanStack Query's deep comparison, so the cached data is invisible to the component.

Additionally, the nebula prefetch caches per-postType feeds (video, feed-images, feed-simple) but the home feed in "Latest" mode uses a single unified feed query (no postType) -- those per-type caches are also never used because `useInterleavedFeed` is false for the default "Latest" sort.

### The Fix

**File: `src/hooks/use-feed-prefetch.ts`**

1. Add `postType: undefined` to the `homeFeedParams` object so the cache key matches what the `useUnifiedFeed` hook generates
2. Also add `followingOnly: undefined` if missing (already present -- verify)

**File: `src/hooks/use-nebula-prefetch.ts`**

1. Add a 4th prefetch for the single unified home feed (no postType) alongside the 3 per-type feeds
2. Cache it with the correct key including `postType: undefined` and `followingOnly: undefined`

### Technical Details

**`src/hooks/use-feed-prefetch.ts` changes:**
- In the `homeFeedParams` object (around line 287), add `postType: undefined` to match the component's query key shape exactly

**`src/hooks/use-nebula-prefetch.ts` changes:**
- Add a new `fetchFeed` call with no postType filter (pass empty string or omit the param from the URL)
- Cache it under a key that includes `postType: undefined, followingOnly: undefined` to match the singleFeed query key
- This ensures the nebula hover prefetch also populates the correct cache for "Latest" sort
