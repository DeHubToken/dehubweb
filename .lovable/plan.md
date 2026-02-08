

## Fix: Image Posts Should Preserve Their Natural Aspect Ratio

### Problem

Every image in the feed carousel is forced into a square container (`aspect-square`) with `object-cover`, which crops portrait and landscape images. A portrait image (e.g. the Galatasaray post) loses its top and bottom, appearing as a square.

### Solution

Remove the fixed `aspect-square` constraint and let images render at their natural dimensions, while keeping sensible bounds to avoid extremely tall or wide images breaking the layout.

### Approach: Dynamic Aspect Ratio with Bounds

Instead of a fixed square, let the first image in a post "set" the container height naturally, with a max-height to prevent excessively tall images from dominating the feed.

### Changes to `src/components/app/cards/ImageCard.tsx`

**1. Update the image container in `ImageCarousel`**

Replace the fixed `aspect-square` div with a container that adapts to the image's natural aspect ratio:

- Remove `aspect-square` from the wrapper div
- Change the img from `object-cover` to `object-contain` inside a bounded container
- Set `max-h-[600px]` (or similar) to prevent very tall portrait images from being too dominant
- Use `bg-zinc-800` as the letterbox background for images that don't fill the full width
- Keep `w-full` so landscape/square images still stretch to full width

**2. Specific code change in the `ImageCarousel` component (around lines 143-161)**

Current code:
```tsx
<div className="flex-[0_0_100%] min-w-0">
  <div className="aspect-square bg-zinc-800 cursor-pointer">
    <img src={img} className="w-full h-full object-cover" />
  </div>
</div>
```

New code:
```tsx
<div className="flex-[0_0_100%] min-w-0">
  <div
    className="bg-zinc-800 cursor-pointer flex items-center justify-center max-h-[600px] overflow-hidden"
    onClick={...}
  >
    <img
      src={img}
      className="w-full max-h-[600px] object-contain"
      loading="lazy"
    />
  </div>
</div>
```

This ensures:
- Portrait images render tall (up to 600px) with horizontal letterboxing
- Landscape images render wide, filling the card width with minimal vertical letterboxing
- Square images look the same as before
- No image exceeds 600px in height, keeping the feed scrollable

**3. Collage grid (ImagesFeed.tsx) stays unchanged**

The collage view in `ImagesFeed.tsx` intentionally uses `aspect-square` with `object-cover` for its grid layout. This is the correct behavior for a thumbnail grid -- cropping to squares is expected there. No changes needed.

### What stays the same

- Fullscreen image viewer (already shows natural dimensions)
- Collage/grid thumbnails (square crop is intentional there)
- Single post page rendering (uses `ImageCard`, so it inherits the fix)
- Carousel navigation (dot indicators, arrow buttons, swipe gestures)
- All other card types (Video, Post, Live)

### Technical Details

| File | Change |
|------|--------|
| `src/components/app/cards/ImageCard.tsx` | Remove `aspect-square` and `object-cover` from carousel slides; use `object-contain` with `max-h-[600px]` bounded container |

Single file change. No new dependencies, no database changes.
