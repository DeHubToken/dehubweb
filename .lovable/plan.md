
# Plan: Fix Feed Refresh on Back Navigation

## Problem Identified

When you navigate back from a post page, the feed shows a loading spinner and refreshes even though React Query has cached data. This happens because:

1. **State Reset on Remount**: When `HomeFeed` remounts, `hasPreFetched` is initialized to `false`
2. **Random Mode Guard**: When `hasPreFetched` is `false` and sort is "Random", the `items` array is returned as empty (to prevent partial shuffles)
3. **Loading Logic Flaw**: The loading state check `items.length > 0` fails because items is empty, triggering the spinner

## Root Cause Flow

```
User clicks back
  → HomePage remounts
  → HomeFeed remounts with fresh state
  → hasPreFetched = false (useState initial)
  → isPreFetchingRandom = true (because sort is 'random')
  → items = [] (guard in useMemo returns empty)
  → hasCachedData = false (items.length check fails)
  → isLoadingState = true
  → Shows spinner! ❌
```

## Solution

Persist `hasPreFetched` state using sessionStorage, so when returning via back navigation:
- The state is restored from session, not reset to `false`
- Items are computed from cached React Query data immediately
- No loading spinner appears

## Technical Changes

### File: `src/components/app/feeds/HomeFeed.tsx`

**1. Initialize `hasPreFetched` from sessionStorage:**
```typescript
const getInitialPreFetched = () => {
  try {
    return sessionStorage.getItem('home-feed-prefetched') === 'true';
  } catch {
    return false;
  }
};

const [hasPreFetched, setHasPreFetched] = useState(getInitialPreFetched);
```

**2. Save to sessionStorage when pre-fetch completes:**
```typescript
// In the pre-fetch effect:
else if (currentPageCount >= RANDOM_PREFETCH_PAGES || !hasNextPage) {
  setHasPreFetched(true);
  sessionStorage.setItem('home-feed-prefetched', 'true');
}
```

**3. Reset the persisted state on explicit refresh:**
```typescript
// In shuffleKey effect:
if (shuffleKey > 0) {
  setHasPreFetched(false);
  sessionStorage.removeItem('home-feed-prefetched');
  // ... rest of refresh logic
}
```

## Alternative Approach (Cleaner)

Instead of persisting pre-fetch state, we can change the loading logic to check for React Query cache directly:

```typescript
// Check if React Query has data regardless of hasPreFetched state
const hasQueryData = feedData?.pages && feedData.pages.length > 0;

// Only show loading when there's truly no cached data
const isLoadingState = !hasQueryData && isLoading;
```

This would render the cached content immediately, even if `hasPreFetched` is false. The shuffle logic would still work because the pre-fetch effect would trigger, but users would see stale content while it happens (acceptable tradeoff for instant rendering).

## Recommended Approach

Combine both:
1. Persist `hasPreFetched` in sessionStorage for the cleanest UX
2. Add a fallback that shows cached data even if state restoration fails

## Files to Modify
- `src/components/app/feeds/HomeFeed.tsx` - Persist and restore pre-fetch state

## Expected Result
- Back navigation shows cached feed content instantly
- No loading spinner when returning from a post
- Pull-to-refresh still works (clears the persisted state)
