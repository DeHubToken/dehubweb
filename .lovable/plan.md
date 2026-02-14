

# Leaderboard: Show All Users with Infinite Scroll Pagination

## Overview
Remove the zero-value filters from the backend so all users appear, and add client-side infinite scroll pagination to the leaderboard page so it loads in batches (e.g., 25 at a time) as the user scrolls down.

## Changes

### 1. Backend: Remove Zero-Value Filters
**File:** `supabase/functions/refresh-leaderboard-cache/index.ts`

- **Line 550**: Remove `.filter((e) => e.total > 0)` so users with 0 holdings are included
- **Line 755**: Remove `.filter((e) => (e[metric] ?? 0) > 0)` so users with 0 followers/likes/subscribers are included

All users will still be sorted by value (descending), so zero-value users naturally appear at the bottom.

### 2. Frontend: Add Infinite Scroll Pagination
**File:** `src/pages/app/LeaderboardPage.tsx`

- Add a `visibleCount` state starting at 25
- Slice the filtered/sorted `entries` array to only render the first `visibleCount` items
- Add an `IntersectionObserver` on a sentinel element at the bottom of the list
- When the sentinel becomes visible, increase `visibleCount` by 25 (loading the next batch)
- Reset `visibleCount` to 25 when the user changes category, time period, or search query
- Show a small loading spinner at the bottom while more items exist beyond the current view

### Technical Details

| Area | Detail |
|------|--------|
| Batch size | 25 entries per load |
| Reset triggers | Category change, time period change, search input |
| Scroll detection | `IntersectionObserver` on a div rendered after the last visible entry |
| Badge batching | Only fetch badge balances for the currently visible slice (not all entries) |
| No backend pagination needed | Data is already fully cached; slicing happens client-side for simplicity |

