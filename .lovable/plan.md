
# Plan: Fix "No Content Yet" Flash During Random Mode Pre-fetch

## Problem Identified

The feed sometimes shows "No Content Yet" briefly because of a disconnect between two checks:

1. **Loading State Check** (line 714): Correctly checks `hasQueryData` (if React Query has pages)
2. **Empty State Check** (line 774): Incorrectly checks `items.length === 0` 

When in "Random" sort mode (the default), the `items` array is deliberately kept empty until all 5 pages are pre-fetched (to enable cross-page shuffling). But the empty state check doesn't account for this - it sees `items.length === 0` and shows "No Content Yet" instead of showing a loading state.

### The Race Condition Flow

```
Page loads with Random sort
  → hasPreFetched = false (from state)
  → feedData.pages starts populating from cache/API
  → hasQueryData = true (pages exist)
  → isLoadingState = false (has query data!)
  → items = [] (guard returns empty during pre-fetch)
  → Empty state check: items.length === 0 ✓
  → Shows "No Content Yet" ❌
```

## Solution

Add an additional guard to the empty state check that accounts for the pre-fetching phase. The empty state should ONLY show when:
1. Items is empty AND
2. We're NOT pre-fetching random pages AND  
3. We actually have no cached data

### Code Change

**File: `src/components/app/feeds/HomeFeed.tsx`**

Update line 774 from:
```tsx
{items.length === 0 && !pinnedItem && optimisticPosts.length === 0 ? (
```

To:
```tsx
{items.length === 0 && !pinnedItem && optimisticPosts.length === 0 && !isPreFetchingRandom && !hasQueryData ? (
```

This ensures:
- During pre-fetch: `isPreFetchingRandom` is true → Empty state won't show
- After pre-fetch with data: `items.length > 0` → Empty state won't show
- Truly empty (no data from API): Shows empty state correctly

### Additional Safety Improvement

We should also show a loading indicator during the pre-fetch phase. Currently, the loading state only shows when `!hasQueryData`, but during pre-fetch we want visual feedback even if we have some cached pages.

Update the loading state logic:
```tsx
// Show loading during initial load OR during random pre-fetch
const isLoadingState = (!hasQueryData && (isLoading || (pinnedPostId && isPinnedLoading))) 
  || (isPreFetchingRandom && !hasCachedData);
```

## Files to Modify

- `src/components/app/feeds/HomeFeed.tsx` - Fix empty state condition

## Expected Result

- No more "No Content Yet" flash during random mode pre-fetch
- Loading spinner shows appropriately during pre-fetch
- Truly empty feeds still show the empty state correctly
