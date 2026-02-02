
# Plan: Fix Feed Scroll Restoration and Prevent Refresh on Back Navigation

## Problem Summary
When clicking on a post and then pressing the back button, the feed:
1. Shows a refresh/loading indicator
2. Scrolls to the top instead of maintaining position
3. Re-fetches data even though it's cached

## Root Cause Analysis
The issue stems from **component unmounting**. When navigating from `/app` to `/app/post/:id`:
- `HomePage` unmounts completely
- All local state (scroll position, tab state) is lost
- When navigating back, `HomePage` remounts fresh
- React Query still has cached data but the component rebuilds from scratch
- The `isLoading` state briefly flashes even with cached data

## Solution: Multi-Part Fix

### Part 1: Prevent Loading State Flash with Cached Data
**File:** `src/components/app/feeds/HomeFeed.tsx`

Modify the loading check to only show the loader when there's no cached data at all. React Query's `isLoading` is `true` only on initial load (no cache), while `isFetching` includes background refetches. We need to distinguish:
- First load (no data): Show skeleton
- Returning with cache: Show cached data immediately, no loader

```typescript
// Change from showing loader on isLoading to only when data is empty
const showInitialLoader = isLoading && !feedData?.pages?.length;
```

### Part 2: Persist Tab and Filter State Across Navigation
**File:** `src/pages/app/HomePage.tsx`

Use `sessionStorage` to persist the active tab when navigating away and restore it on return:
- Save `activeTab` to sessionStorage before navigation
- Restore from sessionStorage on mount (only for back navigation)

### Part 3: Improve Scroll Restoration Timing
**File:** `src/hooks/use-scroll-restoration.ts`

Current implementation has timing issues. Improve by:
- Use `scrollRestoration: 'manual'` on the browser's history API
- Increase restoration attempts for lazy-loaded content
- Add a `MutationObserver` to detect when content has been rendered before scrolling

### Part 4: Skip Scroll-to-Top on Component Mount for Back Navigation
**File:** `src/pages/app/HomePage.tsx`

The current logic already attempts this but has a race condition. Fix by:
- Checking `isBackNavigation` before any scroll-to-top logic runs
- Using a ref to track if scroll restoration should be skipped entirely

### Part 5: Prevent useEffect Reset Triggers
**File:** `src/pages/app/HomePage.tsx`

The `useEffect` that resets scroll on tab change fires on mount. Ensure it:
- Skips entirely on first mount when returning via back navigation
- Only triggers on actual tab changes, not component remounts

---

## Technical Details

### Updated Hook Logic (`use-scroll-restoration.ts`)
```typescript
// Add browser-level scroll restoration control
useEffect(() => {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
}, []);

// Use longer delays and more attempts for lazy content
const attempts = [0, 50, 100, 200, 400, 800];
```

### HomePage State Persistence
```typescript
const STORAGE_KEY = 'home-feed-state';

// On mount, restore state if back navigation
useEffect(() => {
  if (isBackNavigation) {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const { tab } = JSON.parse(saved);
      setActiveTab(tab);
    }
  }
}, []);

// On navigation away, save state
useEffect(() => {
  return () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tab: activeTab }));
  };
}, [activeTab]);
```

### HomeFeed Loader Check
```typescript
// Only show skeleton loader when truly loading fresh (no cached data)
if (isLoading && !feedData?.pages?.length) {
  return <SkeletonLoader />;
}

// For background refetches, show existing content with optional subtle indicator
```

---

## Files to Modify
1. `src/hooks/use-scroll-restoration.ts` - Improve restoration timing
2. `src/pages/app/HomePage.tsx` - Persist tab state, skip scroll reset on back
3. `src/components/app/feeds/HomeFeed.tsx` - Fix loading state to use cached data

## Expected Outcome
- Clicking a post then pressing back will:
  - Show the cached feed content **instantly** (no loader)
  - Restore to the exact scroll position
  - Maintain the same tab selection
  - Feel like a native app with no visible refresh
