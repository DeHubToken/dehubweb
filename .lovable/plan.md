

## Fix: Leaderboard Showing All-Time Stats for All Tabs

### Root Cause

The database is intermittently returning **503 errors** (service unavailable) due to overload. When the cache fetch fails, the code falls back to calling the DeHub API directly at `/api/leaderboard`. However, the DeHub API does not support period-based filtering -- it always returns all-time data. This means every tab (Day, Week, Month, Year) falls back to showing the same all-time data.

Additionally, `placeholderData: (prev) => prev` on the main leaderboard page keeps showing the previous tab's data while loading, making all tabs appear identical.

### Fix Plan

**1. Stop the API fallback from masquerading as period data**

In `src/lib/api/dehub/leaderboard.ts`, when the cache fails and we fall back to the API:
- For non-"all" periods, return an **empty result** instead of all-time data from the API. The API simply doesn't have delta/period data, so returning its all-time results for a "day" query is incorrect.
- Only use the API fallback for `period === 'all'`.

**2. Remove `placeholderData` cross-contamination**

In `src/pages/app/LeaderboardPage.tsx`:
- Remove `placeholderData: (prev) => prev` so that switching from "All Time" to "Day" doesn't show stale all-time entries while loading.
- Instead, show a loading spinner briefly until the correct period data arrives.

**3. Add retry logic for 503 errors**

In `src/lib/api/dehub/leaderboard.ts`:
- Add a single retry with a 2-second delay when the cache query returns a 503 error, before giving up and returning empty results.

**4. Show "No data for this period" state**

In `src/pages/app/LeaderboardPage.tsx`:
- When a period query returns zero entries and it's not "all", display a message like "No data available for this period yet" instead of an empty table or stale data.

### Technical Details

**File: `src/lib/api/dehub/leaderboard.ts`**
- After the cache fetch fails for non-"all" periods, return `{ result: { byWalletBalance: [] }, hasHistoricalData: false }` instead of calling the API.
- Add one retry on 503 with a 2-second delay.

**File: `src/pages/app/LeaderboardPage.tsx`** (line ~171)
- Remove `placeholderData: (prev) => prev`
- Add an empty-state UI when `entries.length === 0 && !isLoading && timePeriod !== 'all'`

**File: `src/components/app/sidebar/SidebarLeaderboard.tsx`** (line ~94)
- When `entries.length === 0` for a non-"All" period, show "No data yet" instead of 10 placeholder skeleton rows (which look like real data loading).

