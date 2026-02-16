

# Fix: Follow Suggestions Showing Empty Prematurely

## Problem
The empty state ("No suggestions yet") renders immediately when `suggestions.length === 0`, but the auto-fetch `useEffect` hasn't had a chance to fire yet. React renders first, then runs effects -- so the user sees the empty state briefly (or permanently if the effect doesn't re-trigger properly). This affects all users, not just those following many people.

## Solution
Update the empty-state guard in `WhoToFollow.tsx` (and the equivalent in `MobileWhoToFollowCarousel.tsx`) to check whether auto-fetching is still possible. If there are still pages to load and we haven't hit the 5-batch cap, show a loading spinner instead of the empty state.

## Changes

### `src/components/app/WhoToFollow.tsx`
Replace the `suggestions.length === 0` empty-state block (~line 253) with a check:
- If `suggestions.length === 0` AND there are still more pages to auto-fetch (i.e., `hasNextPage && pagesLoaded < 5`), show a spinner (same as the initial loading state)
- Only show "No suggestions yet" when auto-fetching is truly exhausted

### `src/components/app/mobile/MobileWhoToFollowCarousel.tsx`
Apply the same logic to the mobile component's empty state so both desktop and mobile stay consistent.

## Technical Detail

```typescript
// Before (broken):
if (suggestions.length === 0) {
  return <EmptyState />;
}

// After (fixed):
const pagesLoaded = data?.pages?.length ?? 0;
const stillAutoFetching = hasNextPage && pagesLoaded < 5;

if (suggestions.length === 0 && (isFetchingNextPage || stillAutoFetching)) {
  return <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />;
}

if (suggestions.length === 0) {
  return <EmptyState />;
}
```

This ensures the loading spinner stays visible while the system is still searching for suggestions across additional batches.

## Files Modified
- `src/components/app/WhoToFollow.tsx`
- `src/components/app/mobile/MobileWhoToFollowCarousel.tsx`
