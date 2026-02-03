

# Fix: Tab Switching Feed Refresh (Root Cause Found)

## Problem

When switching between tabs (Home → Videos/Images/Shorts), the feeds refresh instead of loading instantly from cache. The user sees loading states and network requests fire.

## Root Cause

**The "Random" sort mode pre-fetches 5 pages to enable cross-page shuffling.**

When VideosFeed/ImagesFeed/ShortsFeed mounts with "Random" as the default sort:

1. Page 1 loads from cache (if prefetched) ✓
2. The random prefetch effect immediately triggers, fetching pages 2, 3, 4, 5
3. This causes the loading spinner and network requests

```typescript
// VideosFeed.tsx lines 444-459
useEffect(() => {
  if (selectedSort.value !== 'random') {
    setHasPreFetched(true);
    return;
  }
  
  const currentPageCount = apiData?.pages?.length || 0;
  
  // This triggers IMMEDIATELY when page 1 is from cache
  if (currentPageCount < RANDOM_PREFETCH_PAGES && hasNextPage && !isFetchingNextPage && !hasPreFetched) {
    fetchNextPage(); // Triggers network requests!
  }
}, [...]);
```

## Solution

**Change the default sort from "Random" to "Latest"** for Videos, Images, and Shorts feeds.

### Why This Works

- "Latest" sort only needs page 1 initially
- No multi-page prefetch is triggered
- Page 1 comes from cache = instant display
- User can still select "Random" if desired (will then prefetch 5 pages)

### Alternative Considered (Not Recommended)

Prefetching 5 pages for each feed would mean:
- 5 pages × 3 feeds (Videos, Images, Shorts) × 2 variants (public + auth) = **30 API calls**
- This is excessive and would slow initial load significantly

## File Changes

### 1. `src/components/app/feeds/VideosFeed.tsx`

**Change default sort from SORT_OPTIONS[0] ("Random") to SORT_OPTIONS[1] ("Latest"):**

```typescript
// Line ~369
// Before:
const [selectedSort, setSelectedSort] = useState<SortOption>(SORT_OPTIONS[0]);

// After:
const [selectedSort, setSelectedSort] = useState<SortOption>(SORT_OPTIONS[1]); // Default to Latest
```

### 2. `src/components/app/feeds/ImagesFeed.tsx`

**Same change:**

```typescript
// Line ~267
// Before:
const [selectedSort, setSelectedSort] = useState<SortOption>(SORT_OPTIONS[0]); // Random

// After:
const [selectedSort, setSelectedSort] = useState<SortOption>(SORT_OPTIONS[1]); // Default to Latest
```

### 3. `src/components/app/feeds/ShortsFeed.tsx`

**Same change:**

```typescript
// Line ~217
// Before:
const [selectedSort, setSelectedSort] = useState<SortOption>(SORT_OPTIONS[0]);

// After:
const [selectedSort, setSelectedSort] = useState<SortOption>(SORT_OPTIONS[1]); // Default to Latest
```

### 4. `src/hooks/use-feed-prefetch.ts`

**Update prefetch to use "Latest" sort parameters to match the new default:**

For Videos:
```typescript
const videosParamsPublic = {
  postType: 'video' as const,
  sortBy: 'createdAt' as const,  // Already correct for "Latest"
  // ...rest unchanged
};
```

For Images (update to match "Latest"):
```typescript
// sortMode should be 'new' which is already correct for Latest
```

For Shorts:
```typescript
// sortMode should be 'new' which is already correct for Latest  
```

**Note:** The prefetch is already using `sortBy: 'createdAt'` and `sortMode: 'new'` which matches "Latest" sort. No changes needed in prefetch.

## Technical Details

### SORT_OPTIONS Reference

```typescript
// src/lib/feed-utils.ts
export const SORT_OPTIONS = [
  { label: 'Random', value: 'random' as const },      // Index 0
  { label: 'Latest', value: 'latest' as const },      // Index 1 ← NEW DEFAULT
  { label: 'Most Viewed', value: 'most-viewed' as const },
  { label: 'Most Liked', value: 'most-liked' as const },
  { label: 'Most Comments', value: 'most-comments' as const },
] as const;
```

### Why "Latest" Instead of Another Sort

- "Latest" (`sortBy: 'createdAt'`) is already what the prefetch uses
- It's the most intuitive default for social media feeds
- Users see newest content first
- No multi-page prefetch needed

## Expected Result

After this fix:

1. User loads app → Home feed loads
2. Prefetch runs in background (page 1 of each feed with "Latest" sort params)
3. User switches to Videos/Images/Shorts tab
4. **Feed loads INSTANTLY from cache** - no network requests, no spinner
5. Content displays immediately
6. If user wants Random sort, they can select it (will then trigger 5-page prefetch)

## Verification Steps

1. Open DevTools → Network tab
2. Load app on Home feed
3. Wait 2 seconds for prefetch to complete
4. Switch to Videos tab
5. **Expected**: No new network requests, instant content display
6. Repeat for Images and Shorts tabs

