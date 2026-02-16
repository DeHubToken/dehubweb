

# Fix: Follow Suggestions Empty for Users Following Many People

## Problem
The follow suggestions system fetches only 2 pages of NFTs (200 items) from the `searchNFTs` API. After extracting unique creators (~100-150 users), it filters out the 170 people you already follow, your own account, and users without avatars. This leaves zero or near-zero suggestions.

## Solution
Automatically fetch additional batches when the filtered suggestion pool is too small after the initial load. This ensures users who follow many people still see a healthy list of suggestions.

### Changes in `src/components/app/WhoToFollow.tsx`
- After the initial data loads, check if filtered `suggestions.length` is below a minimum threshold (e.g., 5)
- If so, automatically trigger `fetchNextPage()` up to a reasonable limit (e.g., 5 total batches / 1000 NFTs)
- Add a `useEffect` that watches `suggestions.length` and `data?.pages?.length` to auto-fetch more when needed

### Changes in `src/components/app/mobile/MobileWhoToFollowCarousel.tsx`
- Apply the same auto-fetch logic so the mobile carousel also backfills when suggestions are sparse

## Technical Detail

Both components will get a new `useEffect` like:

```typescript
// Auto-fetch more batches if suggestions are sparse after filtering
useEffect(() => {
  const pagesLoaded = data?.pages?.length ?? 0;
  const MAX_AUTO_BATCHES = 5; // up to 1000 NFTs total
  const MIN_SUGGESTIONS = 5;

  if (
    suggestions.length < MIN_SUGGESTIONS &&
    hasNextPage &&
    !isFetchingNextPage &&
    pagesLoaded < MAX_AUTO_BATCHES &&
    !isLoadingInitial
  ) {
    fetchNextPage();
  }
}, [suggestions.length, hasNextPage, isFetchingNextPage, data?.pages?.length, isLoadingInitial]);
```

This ensures the system keeps pulling more creator data until it finds enough unfollowed users to display, capped at 5 batches to avoid excessive API calls.

## Files Modified
- `src/components/app/WhoToFollow.tsx` -- add auto-fetch effect
- `src/components/app/mobile/MobileWhoToFollowCarousel.tsx` -- add auto-fetch effect

