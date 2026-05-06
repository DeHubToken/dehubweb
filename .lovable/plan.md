# Make the Home Feed Feel Faster

Goal: keep the unified preloader, but make the *content* phase look instant by progressively painting cards instead of waiting for everything to be ready at once.

## Strategy

We use four perception tricks, layered together:

1. **Skeleton cards in the feed body** (not a full-page reload).  
   While the first page loads, render N (e.g. 6) empty card-shaped placeholders inside the existing feed column. Same width, same rounded corners, same vertical spacing as real cards. The shell never moves; only the inner cards fill in.

2. **Render text/avatar/reactions first, defer media decode.**  
   For each card, the shell (avatar, name, handle, body text, action bar) paints immediately from the JSON response. The image/video slot shows a soft shimmer placeholder until the asset is decoded.

3. **Prioritise the first 2-3 thumbnails.**  
   - First 2 visible images: `loading="eager"` + `fetchpriority="high"` + `decoding="async"`.  
   - Everything below the fold: `loading="lazy"` + `fetchpriority="low"`.  
   - For videos, set `preload="metadata"` on the first card and `preload="none"` on the rest until they enter the viewport.

4. **Stream cards in as data arrives.**  
   Instead of waiting for video + image + text queries to all settle before interleaving, render whichever query resolves first as a partial list, then re-interleave when the others arrive. This means the user sees the first cards within ~150-300 ms of the API responding, instead of after the slowest of the three.

## What changes

### `src/components/app/feeds/HomeFeed.tsx`
- When `isLoadingState` is true and there are no items yet, render `FeedCardSkeleton` × 6 inside the same bento column (replace the small spinner). No size change vs real cards.
- Compute `interleavedItems` from whichever queries have data, instead of gating on all three. Re-run the interleave on each successful query.
- Pass an `isPriority` prop to the first 2 cards.

### New: `src/components/app/cards/FeedCardSkeleton.tsx`
- A single skeleton matching the real card geometry: avatar circle, two text lines, 16:9 media block, action bar row. Uses the existing `animate-pulse` style with `bg-white/5`.

### `src/components/app/cards/VideoCard.tsx`, `ImageCard.tsx`, `PostCard.tsx`
- Accept `priority?: boolean`.
- On the `<img>` thumbnail: `loading={priority ? 'eager' : 'lazy'}`, `fetchPriority={priority ? 'high' : 'low'}`, `decoding="async"`.
- Wrap the media slot in a div with a static `aspect-video` (or correct ratio) so the card never reflows when the image decodes. Show a subtle `bg-white/5` placeholder underneath until `onLoad`.
- Render the avatar + meta + action bar synchronously regardless of media state.

### Optional polish
- Add `<link rel="preload" as="image" href="…">` for the first 2 thumbnail URLs once their JSON is in cache (inject from `HomeFeed`). This starts the network fetch a few ms earlier.

## Visual flow after change

```
t=0     shell paints (already instant)
t=50ms  6 card skeletons appear in feed column
t=200ms first JSON arrives → cards paint with avatar + text + grey media slots
t=300ms first 2 thumbnails decode (high priority)
t=600ms rest fade in as they decode / scroll into view
```

No second skeleton, no layout shift, and the user sees real text + avatars in ~200 ms instead of staring at a spinner until the slowest query finishes.

## Files to change
- `src/components/app/feeds/HomeFeed.tsx`
- `src/components/app/cards/VideoCard.tsx`
- `src/components/app/cards/ImageCard.tsx`
- `src/components/app/cards/PostCard.tsx`
- `src/components/app/cards/FeedCardSkeleton.tsx` (new)
