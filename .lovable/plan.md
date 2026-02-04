
# Plan: Fix "Most Liked" Feed to Show Global Ranking

## Problem
Post 2008 (the platform's most-liked post with 199 likes) is not appearing at the top of the Home Feed when "Most Liked" sorting is selected. 

## Root Cause
The Home Feed currently makes **three separate API calls** when showing "All" content:
- `/api/feed?postType=video&sortBy=likes` - Gets most-liked **videos only**
- `/api/feed?postType=feed-images&sortBy=likes` - Gets most-liked **images only**  
- `/api/feed?postType=feed-simple&sortBy=likes` - Gets most-liked **text posts only**

These results are then interleaved in a fixed pattern (video, video, image, video, text, etc.), which:
1. Only ranks items within their own category (not globally)
2. Rearranges the order based on the pattern, not by likes

## Solution
When "Most Liked" is selected, use a **single unified feed** that fetches all content types together, globally sorted by likes.

## Changes Required

### File: `src/components/app/feeds/HomeFeed.tsx`

**Change 1:** Modify the interleaved feed logic to use single feed for "Most Liked"

Current (around line 311):
```typescript
const useInterleavedFeed = selectedPostType === 'all';
```

Updated:
```typescript
// For "Most Liked" sorting, we need global ranking across all types
// So we use a single unified feed instead of three separate type feeds
const useSingleFeedForGlobalSort = selectedSort.value === 'most-liked';
const useInterleavedFeed = selectedPostType === 'all' && !useSingleFeedForGlobalSort;
```

**Change 2:** Update the single feed query to handle "All" post types

Current (around lines 335-339):
```typescript
const singleFeed = useUnifiedFeed({
  ...commonParams,
  postType: selectedPostType === 'all' ? undefined : selectedPostType,
  enabled: !useInterleavedFeed,
});
```

Updated:
```typescript
const singleFeed = useUnifiedFeed({
  ...commonParams,
  // When using single feed for global sort OR specific type filter, pass appropriate postType
  // undefined = fetch all types (what the API expects for "all")
  postType: (useSingleFeedForGlobalSort && selectedPostType === 'all') 
    ? undefined 
    : (selectedPostType === 'all' ? undefined : selectedPostType),
  enabled: !useInterleavedFeed,
});
```

This can be simplified to:
```typescript
const singleFeed = useUnifiedFeed({
  ...commonParams,
  postType: selectedPostType === 'all' ? undefined : selectedPostType,
  enabled: !useInterleavedFeed,
});
```

Since `useSingleFeedForGlobalSort` already sets `useInterleavedFeed = false` when needed.

## Result
- When "Most Liked" is selected with "All" content types, the feed will make a single call: `/api/feed?sortBy=likes&sortOrder=desc`
- This returns ALL content types globally sorted by likes
- Post 2008 (199 likes) will appear first
- The server-side cache (`feed_popular_page1`, etc.) will be used for faster loading
- Other sort modes (Latest, Most Viewed, Most Comments) can continue using the interleaved pattern if desired, or you can apply the same logic to all sorts for consistency

## Technical Notes
- The `getCacheKey` function in `use-unified-feed.ts` already correctly maps `sortBy: 'likes'` to `feed_popular_page*` cache keys
- The cache only works when `postType` is `'all'` (line 284), which aligns with our fix
- No changes needed to the unified feed hook or cache refresh function
