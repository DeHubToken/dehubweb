

# Shimmer Glass Border for Unwatched Stories

## Overview
Add an animated "light on glass" shimmer effect to unwatched story thumbnail borders in the StoriesBar. A soft white highlight will sweep around the border edge using a rotating conic gradient, creating the illusion of light catching a glass surface. Watched stories lose the shimmer and show a dimmed static border.

## Visual Design
- **Unwatched**: A bright white conic highlight rotates around the `rounded-xl` border every ~4 seconds, with a natural pause between sweeps
- **Watched**: Static `border-white/10` with no animation — clear visual distinction
- **Create button**: Keeps its current static gradient border (no shimmer)

## Technical Details

### 1. Add CSS keyframes (in `src/index.css`)
Define a `@keyframes story-shimmer` animation:
- A conic gradient with a concentrated white highlight (~30deg arc) rotates 360deg
- Uses an `ease-in-out` timing with a built-in pause (the gradient is mostly transparent, so most of the rotation looks "idle")
- Duration: ~4 seconds per loop
- The gradient goes from `transparent` to `white/60` back to `transparent` across a narrow arc

### 2. Add Tailwind animation (in `tailwind.config.ts`)
Register `story-shimmer` in the `animation` and `keyframes` sections so it can be applied via class.

### 3. Create a ShimmerBorder wrapper component
A small component in `src/components/app/stories/ShimmerBorder.tsx` that:
- Wraps the story thumbnail in a `relative` container with `rounded-xl`
- Uses a `::before` pseudo-element (via Tailwind arbitrary + the CSS class) to render the animated conic gradient as the border
- Accepts an `active` prop: when `true`, the shimmer animates; when `false`, it shows a static dim border
- The inner content sits on top with `rounded-[10px]` matching the current design

### 4. Update StoriesBar.tsx
- Import `ShimmerBorder`
- Replace the current static `bg-gradient-to-br from-white/40 via-white/20 to-white/5 p-[2px]` wrapper on story items with `ShimmerBorder`
- Pass `active={!isWatched}` (for now, all template stories default to unwatched/active since there's no watch-tracking yet)
- The "Create" button keeps its existing static border unchanged

### 5. Watch state tracking (lightweight)
- Store watched story IDs in `localStorage` via a small utility
- When a user views a story (clicks into StoryViewerModal), mark its ID as watched
- On next render, stories with watched IDs get the static border instead of the shimmer

## Files Changed
1. **`src/index.css`** — Add `@keyframes story-shimmer` with the rotating conic gradient
2. **`tailwind.config.ts`** — Register the `story-shimmer` animation
3. **`src/components/app/stories/ShimmerBorder.tsx`** — New wrapper component for the animated border
4. **`src/components/app/stories/index.ts`** — Export ShimmerBorder
5. **`src/components/app/cards/StoriesBar.tsx`** — Use ShimmerBorder, integrate watched-state logic
6. **`src/hooks/use-stories.ts`** — Add `useWatchedStories()` hook using localStorage

## Performance
- Pure CSS animation — no JavaScript animation loop running per thumbnail
- `will-change: transform` on the pseudo-element for GPU compositing
- Animation only runs on visible unwatched stories; watched stories have zero animation overhead
