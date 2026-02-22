

# Fix: Home Feed Cache Never Actually Works

## Root Cause

The server-side cache (`feed_cache` table) only caches feeds with `postType = 'all'`, but the HomeFeed component makes 3 separate queries with specific post types:
- `postType: 'video'`
- `postType: 'feed-images'`
- `postType: 'feed-simple'`

In `getCacheKey()` (line 352), there's an explicit guard:
```
if (postType !== 'all') return null; // Only cache "all" feed for now
```

This means the cache is **never hit** for the actual home feed queries. Both authenticated AND non-authenticated users always wait 1-3 seconds for 3 parallel DeHub API calls.

The `sessionStorage` client-side cache added in the last change also doesn't help on the **first visit** since there's nothing stored yet.

## Fix

### 1. Expand `getCacheKey()` to support per-postType caches

Update the function to generate cache keys for `video`, `feed-images`, and `feed-simple` post types, not just `'all'`.

```
feed_latest_video_page1
feed_latest_feed-images_page1
feed_latest_feed-simple_page1
```

### 2. Expand the `refresh-feed-cache` Edge Function to pre-warm per-type caches

Currently the cron job only caches the "all" feed. It needs to also cache the 3 post-type-specific feeds that the HomeFeed actually uses.

### 3. Expand the Nebula prefetch to match cache keys

The `use-nebula-prefetch.ts` already fetches per-type feeds and caches them in React Query, but the query keys it uses may not align with what `useUnifiedFeed` expects. Verify alignment so the prefetched data is actually used.

## Technical Changes

### File: `src/hooks/use-unified-feed.ts`

**`getCacheKey()`** -- expand to support per-type cache keys:
- Remove the `if (postType !== 'all') return null` guard
- Generate keys like `feed_latest_video_page1`, `feed_popular_feed-images_page1`
- Keep existing guards for user-specific queries, PPV, etc.

### File: `supabase/functions/refresh-feed-cache/index.ts`

Add cache warming for the 3 home feed post types:
- For each of `video`, `feed-images`, `feed-simple`:
  - Fetch page 1 from the DeHub API
  - Store in `feed_cache` with keys like `feed_latest_video_page1`
- This runs on the existing hourly cron, so no additional scheduling needed

### File: `src/hooks/use-nebula-prefetch.ts`

Verify the React Query keys used by `prefetchHomeFeed()` match the keys used by `useUnifiedFeed` in `HomeFeed.tsx`. Currently the prefetch manually constructs query keys that may not match.

## Expected Result

- First-time non-authenticated visitors get cached data in ~100ms (from `feed_cache`) instead of waiting 1-3s for the DeHub API
- The nebula prefetch warms React Query on first interaction, so switching to the home tab is instant
- The session cache provides instant loads on repeat visits within the same session
- Authenticated users get the same instant first-paint, with personalized data updating moments later via background refetch

