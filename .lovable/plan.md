

# Fix: Shorts Thumbnail Reload on Tab Switch

## Problem

When switching between Home and other tabs (Videos, Images, etc.), the Shorts carousel thumbnails visibly reload every time you return to Home. This happens because:

- The tab system completely unmounts `HomeFeed` when switching away, destroying all image elements
- When you return, new image elements are created from scratch
- The thumbnails use `loading="lazy"`, which delays image loading even when they're already in the browser cache
- This creates a visible flash/shimmer as images re-paint

The data itself is cached (no extra API calls), but the images need to re-render in the DOM each time.

## Solution

Two changes to eliminate the visual reload:

### 1. Remove lazy loading from Shorts thumbnails

The Shorts reel is above the fold on the Home feed, so `loading="lazy"` actually hurts performance here. Removing it ensures images start loading immediately when the component mounts, pulling instantly from browser cache on return visits.

**File: `src/components/app/cards/ShortsReel.tsx`**
- Remove `loading="lazy"` from the thumbnail `<img>` tag (line 62)
- Also remove it from the avatar `<img>` tag (line 70) for consistency

### 2. Add module-level image pre-warming cache

Use the same pattern that Stories uses for avatar caching -- a persistent module-level `Set` that survives component unmounts. When shorts data arrives, pre-create `Image()` objects for each thumbnail URL. This tells the browser to fetch and cache them immediately, so when the DOM elements are recreated on tab switch, the images are already warm in memory.

**File: `src/components/app/cards/ShortsReel.tsx`**
- Add a module-level `preloadedThumbnails` Set outside the component
- Add a `useEffect` that loops through `shorts` and pre-creates `Image()` objects for any URLs not yet in the Set
- This ensures thumbnails are browser-cached on first load and render instantly on subsequent mounts

## Technical Details

```text
Module-level cache (persists across unmount/remount):

const preloadedThumbnails = new Set<string>();

On mount with shorts data:
  for each short.thumbnail:
    if not in preloadedThumbnails:
      new Image().src = url   // triggers browser cache
      preloadedThumbnails.add(url)

On render:
  <img src={short.thumbnail} />  // no loading="lazy", instant from cache
```

## Impact

- Shorts thumbnails will appear instantly when returning to Home tab -- no flicker or reload
- First visit still loads normally from CDN
- Zero additional API calls or network overhead (browser cache handles it)
- Consistent with the caching pattern already used by Stories

