

# Infinite Scroll for Follow Suggestions (Mobile + Desktop)

## Overview

Both the mobile carousel and desktop sidebar currently load data in a single bulk fetch. This plan adds proper infinite scroll pagination in batches of 15 visible users to both components.

---

## Mobile: `MobileWhoToFollowCarousel.tsx`

### Current behavior
- Fetches 2 pages (200 NFTs) in one shot via `useQuery`
- Extracts unique users, filters, then hard-caps at 15 with `.slice(0, 15)`
- No way to load more

### New behavior
- Switch from `useQuery` to `useInfiniteQuery`
- Each "page" fetches 2 API pages (200 NFTs) and extracts unique users
- Display users in groups of 15 -- show the first 15 immediately
- At the end of the carousel, add a "Load More" card (a tappable card with a refresh icon)
- When tapped, fetch the next batch and append 15 more user cards to the carousel
- Also auto-trigger `fetchNextPage` when the user scrolls near the end (using a scroll event listener on the carousel container)
- Remove the old `.slice(0, 15)` hard cap

### Key details
- The `fetchSuggestions` function becomes `fetchSuggestionsBatch(batchIndex)` returning `{ users, hasMore }`
- A `visibleCount` state tracks how many users to show (starts at 15, increments by 15)
- The "Load More" card appears at the end when `hasNextPage` or when there are more users in the pool than currently displayed
- A small `Loader2` spinner replaces the card while fetching

---

## Desktop: `WhoToFollow.tsx`

### Current behavior
- Uses `useInfiniteQuery` already, fetching 5 API pages (500 NFTs) per batch
- Shows ALL extracted users at once with no display limit
- Infinite scroll triggers more API fetches via `IntersectionObserver`

### New behavior
- Reduce the initial fetch from 5 pages to 2 pages (matching mobile, ~200 NFTs)
- Add a `visibleCount` state starting at 15
- Only render `suggestions.slice(0, visibleCount)` in the list
- When the `IntersectionObserver` sentinel fires:
  1. First, check if there are more users in the already-fetched pool -- if so, just increment `visibleCount` by 15 (instant, no network call)
  2. Only call `fetchNextPage` when the visible count exceeds the fetched pool size
- This gives a smooth "reveal 15 at a time" experience while minimizing API calls

### Key details
- Change `PAGES_PER_BATCH` from 5 to 2
- The observer callback checks `visibleCount < suggestions.length` before deciding to reveal more vs. fetch more
- A brief loading spinner appears at the bottom only during actual network fetches

---

## Technical Details

### Shared changes
- Both components use the same `UniqueUser` interface (already shared)
- Both use `searchNFTs` with `sortMode: 'new'` and `unit: 100` per API page
- The `has_more` determination stays the same: if the API returns fewer items than expected, there's no more data

### Mobile infinite query function
```text
fetchSuggestionsBatch(batchIndex: number)
  -> fetches API pages [batchIndex*2, batchIndex*2+1]
  -> deduplicates within batch
  -> returns { users: UniqueUser[], hasMore: boolean }
```

### Desktop observer logic
```text
onIntersect:
  if visibleCount < totalFetchedUsers:
    visibleCount += 15  (instant reveal)
  else if hasNextPage:
    fetchNextPage()     (network fetch)
    visibleCount += 15
```

### Files modified
1. `src/components/app/mobile/MobileWhoToFollowCarousel.tsx` -- switch to `useInfiniteQuery`, add `visibleCount`, add "Load More" card at end of carousel
2. `src/components/app/WhoToFollow.tsx` -- reduce initial batch size, add `visibleCount` gating, update observer logic
