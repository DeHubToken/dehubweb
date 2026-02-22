

## Fix: Sidebar Leaderboard Time-Based Tabs Not Loading

### Root Cause

The time-based leaderboard tabs (1d, 1w, 1m, 1y) try to read from the `leaderboard_cache` table in the database as their first data source. The database is currently experiencing timeout issues (504/500 errors visible in network logs for other tables too), which means these cache reads hang silently and never resolve, leaving the sidebar stuck on a loading spinner.

The "All" tab works fine because it bypasses the database cache entirely and calls the DeHub API directly.

### The Fix

Change `getLeaderboard()` in `src/lib/api/dehub/leaderboard.ts` to wrap the database cache read in a timeout (3 seconds). If the cache read fails or times out, immediately fall back to the direct API call instead of hanging forever.

### Technical Changes

**File: `src/lib/api/dehub/leaderboard.ts`**
- Wrap the Supabase cache lookup in a `Promise.race` with a 3-second timeout
- If the cache read times out or errors, fall back to the API call immediately
- This ensures the sidebar leaderboard always loads data within a few seconds regardless of database health

**File: `src/components/app/sidebar/SidebarLeaderboard.tsx`**
- Add `retry: 1` to the `useQuery` options so failed queries retry once quickly rather than showing permanent loading states
- Add `refetchOnMount: false` since data is already cached via TanStack Query's staleTime

This approach keeps the cache as a fast-path optimization while ensuring the sidebar never gets stuck loading.

