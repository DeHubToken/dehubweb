

# Add Category Filter to Home Feed Sort Menu

## Overview
Add a horizontally scrollable category pill row inside the existing sort/filter dropdown, placed directly below the "Sort" row (Latest, Following, etc.). Selecting a category filters the feed to show all content types (posts, images, videos) within that category.

## Changes

### File: `src/components/app/feeds/HomeFeed.tsx`

1. **Import `getCategories`** -- already partially imported from `@/lib/api/dehub`, just needs to be added to the import list
2. **Add `selectedCategory` state** using `usePersistedFeedFilter('home', 'category', 'all')` alongside the existing filter states
3. **Fetch categories** with `useQuery` calling `getCategories()`, with a 5-minute stale time
4. **Extend `FilterSectionProps`** to include `selectedCategory`, `onCategorySelect`, and `categories` array
5. **Add a "Category" row in `SortFilterSection`** directly below the Sort row, using the same pill pattern (horizontal scroll, white active state, zinc-800 inactive, right fade gradient). An "All" pill will be prepended to the fetched list
6. **Pass `category` into `commonParams`** so all feed queries include it when a specific category is selected
7. **Update `resetAllFilters`** to also reset `selectedCategory` to `'all'`

### Visual placement (inside the filter dropdown)
```text
Sort:        [Latest] [Following] [Most Liked] ...
Category:    [All] [Art] [Music] [Gaming] ...     <-- NEW
Upload Date: [All] [1d] [1w] [1m] [1y]
Post Type:   [All] [Video] [Image] [Text]
Content:     [PPV] [W2E] [Locked]
```

### No other files need changes
The `useUnifiedFeed` hook already accepts and forwards a `category` parameter to the API. The `getCategories` function is already implemented.
