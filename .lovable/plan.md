

# Custom Content Ordering for Home Feed

## Overview
Implement a specific content ordering pattern for the home feed that displays videos, text posts, and images in a defined sequence while maintaining "most liked" sorting within each content type.

## The Content Pattern
The feed will follow this exact repeating sequence:

| Position | Type | Count |
|----------|------|-------|
| 1-3 | Videos | 3 |
| 4-5 | Text Posts | 2 |
| 6 | Image | 1 |
| 7-9 | Text Posts | 3 |
| 10-12 | Videos | 3 |
| 13 | Text Post | 1 |
| 14 | Image | 1 |
| 15-17 | Text Posts | 3 |
| 18-19 | Videos | 2 |
| 20-21 | Text Posts | 2 |
| 22 | Image | 1 |
| 23-24 | Text Posts | 2 |
| 25 | Image | 1 |
| 26-28 | Text Posts | 3 |
| 29-31 | Videos | 3 |
| 32 | Video | 1 |
| 33 | Text | 1 |
| 34 | Image | 1 |
| 35 | Video | 1 |
| 36 | Text | 1 |
| 37 | Image | 1 |
| 38-40 | Text | 3 |
| 41-44 | Images | 4 |
| 45-47 | Videos | 3 |
| 48-50 | Text | 3 |

**Total per cycle:** 50 items (16 videos, 24 text posts, 10 images)

---

## Technical Approach

### Strategy: Separate Fetch + Client-Side Interleaving

Since the API returns mixed content sorted by "most liked", we need to:

1. **Fetch each content type separately** (videos, images, text posts) with "most-liked" sorting
2. **Maintain three separate queues** of sorted content
3. **Interleave according to the pattern** from each queue
4. **Handle edge cases** when a queue runs out of content

### Implementation Details

#### 1. Create Pattern Definition Constant

Define the content sequence as an array of content type markers that repeats:

```typescript
const CONTENT_PATTERN: Array<'video' | 'text' | 'image'> = [
  // Cycle pattern as specified
  'video', 'video', 'video',           // 3 videos
  'text', 'text',                       // 2 text posts
  'image',                              // 1 image
  'text', 'text', 'text',               // 3 text posts
  'video', 'video', 'video',            // 3 videos
  'text',                               // 1 text post
  'image',                              // 1 image
  'text', 'text', 'text',               // 3 text posts
  'video', 'video',                     // 2 videos
  'text', 'text',                       // 2 text posts
  'image',                              // 1 image
  'text', 'text',                       // 2 text posts
  'image',                              // 1 image
  'text', 'text', 'text',               // 3 text posts
  'video', 'video', 'video',            // 3 videos
  'video',                              // 1 video
  'text',                               // 1 text
  'image',                              // 1 image
  'video',                              // 1 video
  'text',                               // 1 text
  'image',                              // 1 image
  'text', 'text', 'text',               // 3 text
  'image', 'image', 'image', 'image',   // 4 images
  'video', 'video', 'video',            // 3 videos
  'text', 'text', 'text',               // 3 text
];
```

#### 2. Fetch Content Types Separately

Modify the `HomeFeed` to make **three parallel API calls** instead of one mixed feed call:

- `useUnifiedFeed({ postType: 'video', sortBy: undefined /* most-liked default */ })`
- `useUnifiedFeed({ postType: 'feed-images', sortBy: undefined })`
- `useUnifiedFeed({ postType: 'feed-simple', sortBy: undefined })`

#### 3. Create Interleaving Function

A new utility function that takes three arrays and produces the ordered output:

```typescript
function interleaveByPattern(
  videos: VideoItem[],
  images: ImagePost[],
  texts: TextPost[],
  pattern: Array<'video' | 'text' | 'image'>
): FeedItemType[]
```

This function:
- Maintains index counters for each content type
- Iterates through the pattern
- Picks from the appropriate queue
- Skips if a queue is exhausted (graceful degradation)
- Cycles the pattern when reaching the end

#### 4. Update Infinite Scroll Logic

When the user scrolls to the bottom:
- Determine which content type queues are running low
- Fetch the next page for the depleted queues
- Re-interleave the new items into the display

---

## File Changes

### `src/components/app/feeds/HomeFeed.tsx`

**Changes:**
1. Add `CONTENT_PATTERN` constant at the top
2. Replace single `useUnifiedFeed` call with three separate calls (videos, images, text posts)
3. Add `interleaveByPattern` function to merge content in the specified order
4. Update the `items` useMemo to use the new interleaving logic
5. Update infinite scroll to track and fetch from multiple feeds
6. Keep existing features: shorts carousel injection, radio carousel, filters, pinned posts

### `src/lib/feed-utils.ts` (optional)

Could add the `CONTENT_PATTERN` constant and `interleaveByPattern` utility here for reusability.

---

## Edge Cases Handled

1. **Insufficient content of a type**: Skip that slot, continue with pattern
2. **One feed exhausted**: Continue showing other content types
3. **All feeds exhausted**: Show "end of feed" message
4. **Filter changes**: Reset all three feeds and re-interleave
5. **Sort changes**: If user changes from "Most Liked" to "Latest", the pattern still applies but content order within each type changes
6. **Shorts/Radio carousel injection**: Insert at same intervals (every 5 items, after 15 items)

---

## Performance Considerations

- Three parallel API calls instead of one (slightly more network overhead)
- Server-side caching still applies to each individual feed type
- Prefetching can be updated to warm all three feed type caches
- TanStack Query handles deduplication and caching per feed type

