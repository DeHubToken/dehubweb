
# Plan: Add Infinite Scroll to "Who to Follow" Panel

## Problem
The "Who to Follow" side panel loads a fixed set of users (from pages 0-19 of content) and stops. When you scroll to the bottom, nothing more loads because there's no infinite scroll implementation.

## Solution
Convert the static batch-loading approach to a proper infinite scroll system that fetches more users as you scroll down.

---

## Implementation Steps

### 1. Convert to Infinite Query
Replace the two separate `useQuery` calls with a single `useInfiniteQuery` that loads pages on-demand as you scroll.

### 2. Add Scroll Detection  
Add an `IntersectionObserver` that watches a loader element at the bottom of the list. When it becomes visible, fetch the next page of content.

### 3. Accumulate Unique Users
Maintain a running set of unique users across all loaded pages, filtering out:
- Already-followed users
- The current user
- Users already shown

### 4. Show Loading State
Display a small spinner at the bottom while fetching more users.

---

## Technical Changes

**File: `src/components/app/WhoToFollow.tsx`**

- Replace `useQuery` imports with `useInfiniteQuery` from TanStack Query
- Add `useRef`, `useEffect` for the intersection observer
- Create a `fetchUserPage` function that loads one page at a time
- Add `IntersectionObserver` that triggers `fetchNextPage()` when the bottom loader is visible
- Use `isFetchingRef` guard to prevent duplicate fetches (same pattern as HomeFeed)
- Add loading spinner at the bottom of the list

**Key code pattern (from existing HomeFeed):**
```text
1. loaderRef - reference to bottom sentinel element
2. isFetchingRef - prevents race conditions  
3. IntersectionObserver - watches loaderRef
4. When visible + hasNextPage + not fetching → fetchNextPage()
```

---

## Expected Result
- Initial load shows first batch of suggestions quickly
- Scrolling to bottom automatically loads more suggestions
- Loading spinner appears while fetching
- Continues until no more unique users are found
