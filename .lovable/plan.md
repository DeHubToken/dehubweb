
# Fix Multiple Home Page Refreshes

## Problem Summary

When the home page loads or refreshes, you see the content visually "refresh" 3-4 times in rapid succession. This is jarring and makes the app feel buggy.

## Root Cause

The home feed uses a "Random" sort mode by default that pre-fetches 5 pages of content to enable cross-page shuffling. The issue is:

1. **Sequential Fetching**: The pre-fetch logic triggers one page at a time, running the effect 5 times
2. **Immediate Reshuffling**: Each time a new page arrives, the `balancedShuffle` function runs and reorders all content
3. **Visual Updates on Each Fetch**: Users see the feed content reorganize after each of the 5 fetches

## Solution

Change the rendering logic to only display the shuffled content **after pre-fetching is complete**. This means:

1. Show a loading state while pre-fetching is in progress
2. Only render the final shuffled feed once all 5 pages are loaded
3. This turns 5 visual refreshes into: loading spinner > final content

## Technical Changes

### File: `src/components/app/feeds/HomeFeed.tsx`

**Change 1: Show skeleton/loading during pre-fetch (around line 640-660)**

Update the loading condition to include the pre-fetch state for random mode:

```typescript
// Current loading check
if (isLoading || !feedData?.pages) {
  return <LoadingSkeleton />;
}

// Updated loading check - also wait for pre-fetch in random mode
const isPreFetching = selectedSort.value === 'random' && !hasPreFetched;
if (isLoading || !feedData?.pages || isPreFetching) {
  return <LoadingSkeleton />;
}
```

**Change 2: Stabilize the shuffled items with useMemo dependency (around line 530-600)**

Only recompute the shuffled feed when pre-fetching is complete, not on every page addition:

```typescript
const feedItems = useMemo(() => {
  // Don't compute until pre-fetch is complete for random mode
  if (selectedSort.value === 'random' && !hasPreFetched) {
    return [];
  }
  
  // ... rest of existing mapping logic
}, [feedData, selectedSort.value, hasPreFetched, shuffleTrigger, pinnedItem]);
```

## Expected Result

- The home page will show a loading state during initial load
- Once all 5 pages are pre-fetched, the feed appears with a single, stable shuffle
- No more "flickering" or multiple visual refreshes
- Pull-to-refresh will show loading > refreshed content (one transition)

## Trade-off

The initial load may take slightly longer to show content (waiting for 5 pages instead of 1), but the experience will be much smoother. Users currently wait anyway while watching content reshuffle repeatedly.
