
# Plan: Persist Feed Filter States Across Navigation

## Problem Analysis

When you scroll down the feed with sort filters applied (e.g., "Latest", "Most Liked", or content type filters like PPV/W2E), click on a post, and then navigate back, the filters reset to their defaults.

**Root Cause:** The filter states in `HomeFeed`, `VideosFeed`, and other feed components are stored only in React's local `useState`. While the `HomePage` component persists the active **tab** to `sessionStorage`, the **filter values** within each feed are not persisted.

## Solution Overview

Extend the existing `sessionStorage` persistence pattern to include filter states for each feed type. This mirrors how the tab state is already preserved.

## Technical Implementation

### 1. Update Session Storage Key Structure (HomePage.tsx)

Expand the stored state to include filter states for each tab:

```typescript
// Current structure stores only:
{ tab: 'home' }

// New structure will store:
{
  tab: 'home',
  homeFilters: {
    sort: 'trending',
    date: 'all',
    postType: 'all',
    contentFilters: { ppv: false, w2e: false, locked: false }
  },
  videosFilters: {
    sort: 'trending',
    duration: 'Any',
    date: 'all',
    category: null,
    contentFilters: { ppv: false, w2e: false, locked: false }
  },
  // ... similar for other tabs
}
```

### 2. Create Filter State Persistence Hook

Create a reusable hook `usePersistedFilterState` that:
- Initializes state from sessionStorage on mount
- Saves state to sessionStorage on changes
- Can be used by all feed components

### 3. Update HomeFeed.tsx

Replace local `useState` calls for filters with the persisted version:

```typescript
// Before
const [selectedSort, setSelectedSort] = useState<SortOption>(SORT_OPTIONS[0]);
const [selectedDate, setSelectedDate] = useState<DateFilterOption>(DATE_FILTER_OPTIONS[0]);

// After - using persisted state
const [selectedSort, setSelectedSort] = usePersistedFeedFilter('home', 'sort', SORT_OPTIONS[0]);
const [selectedDate, setSelectedDate] = usePersistedFeedFilter('home', 'date', DATE_FILTER_OPTIONS[0]);
```

### 4. Update VideosFeed.tsx

Apply the same pattern:

```typescript
const [selectedSort, setSelectedSort] = usePersistedFeedFilter('videos', 'sort', SORT_OPTIONS[0]);
const [selectedDuration, setSelectedDuration] = usePersistedFeedFilter('videos', 'duration', DURATION_FILTERS[0]);
const [selectedUploadDate, setSelectedUploadDate] = usePersistedFeedFilter('videos', 'date', DATE_FILTER_OPTIONS[0]);
const [contentFilters, setContentFilters] = usePersistedFeedFilter('videos', 'contentFilters', { ppv: false, w2e: false, locked: false });
```

### 5. Update Other Feed Components

Apply the same pattern to:
- `ShortsFeed.tsx`
- `ImagesFeed.tsx`
- `MusicFeed.tsx`

### 6. Clear Filters on Explicit Refresh

When the user explicitly refreshes (pull-to-refresh or home-refresh event), clear the persisted filter state so filters reset to defaults.

## Files to Modify

1. **New file: `src/hooks/use-persisted-feed-filter.ts`** - Reusable hook for persisted filter state
2. **`src/components/app/feeds/HomeFeed.tsx`** - Use persisted filter states
3. **`src/components/app/feeds/VideosFeed.tsx`** - Use persisted filter states
4. **`src/components/app/feeds/ShortsFeed.tsx`** - Use persisted filter states (if applicable)
5. **`src/components/app/feeds/ImagesFeed.tsx`** - Use persisted filter states (if applicable)
6. **`src/components/app/feeds/MusicFeed.tsx`** - Use persisted filter states (if applicable)
7. **`src/pages/app/HomePage.tsx`** - Update reset logic to clear persisted filters

## Implementation Notes

- Use a single storage key (`home-feed-filters`) for all feed filter states to keep the implementation simple
- JSON serialize/deserialize the filter objects
- Handle edge cases where stored values don't match current filter options (e.g., if options change)
- Filter states are cleared on explicit refresh to ensure users can reset to defaults
