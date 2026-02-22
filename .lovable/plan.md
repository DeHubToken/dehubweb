

## Remove Feed Cache: Simplify to Direct API Calls

### Why the feed cache should go

The `refresh-feed-cache` edge function runs hourly, fetching 6 pages (300 posts) from the DeHub API and storing them in the database. The frontend then **races** the DB cache against the live API on every feed load.

This is redundant because:
- The DeHub API is already fast and always has the latest data
- For logged-in users, the cache lacks personalization (isLiked, isUnlocked, etc.) so the API result always wins
- For guests, TanStack Query's built-in `staleTime` (already set) handles caching perfectly
- The hourly cron job is saturating the DB with 504 timeouts, causing cascading failures

### What changes

**1. Remove the cron job and edge function**
- Delete `supabase/functions/refresh-feed-cache/index.ts`
- Remove the `pg_cron` schedule that triggers it (via SQL)
- Remove the config entry from `supabase/config.toml`

**2. Simplify `use-unified-feed.ts`**
- Remove the `fetchCachedFeed()` function and the race strategy
- All feed loads go directly to the DeHub API (which they already do as a fallback)
- TanStack Query's `staleTime` and `gcTime` handle client-side caching

**3. Compute trending categories client-side**
- `WhatsHappening.tsx` currently reads `trending_categories` from the `feed_cache` table
- Instead, derive trending categories from the first page of feed data already loaded by the home feed query, or fetch them once from the API and cache in TanStack Query with a long `staleTime`

**4. Clean up the `feed_cache` table (optional)**
- The table can be dropped since nothing will write to it anymore
- Or leave it dormant -- no reads means zero cost

### Technical details

**Files to modify:**
- `supabase/functions/refresh-feed-cache/index.ts` -- Delete entirely
- `supabase/config.toml` -- Remove `[functions.refresh-feed-cache]` entry (auto-managed, just delete the function)
- `src/hooks/use-unified-feed.ts` -- Remove `getCacheKey()`, `fetchCachedFeed()`, and the race logic in `fetchUnifiedFeed()`. All calls go straight to `fetchUnifiedFeedFromAPI()`
- `src/components/app/WhatsHappening.tsx` -- Fetch trending categories from the first feed page data (already in TanStack Query cache) or compute from API response directly

**Database cleanup (SQL migration):**
- Unschedule the `refresh-feed-cache` cron job
- Optionally truncate or drop the `feed_cache` table

**Impact:**
- Eliminates the #1 source of 504 timeouts and DB saturation
- Removes 6 DB writes per hour + 6 API calls per hour from the edge function
- Removes 1 DB read per feed load per user (the cache race)
- Feed loads become simpler and more predictable -- just one API call

