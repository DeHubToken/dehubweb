

# Periodic Shimmer Glisten on Story Borders

## What Changes

Instead of the shimmer only appearing on hover (or being always visible), the light sweep will **pulse in and out every few seconds** -- a brief glisten that catches the eye, then fades away, then returns. Like light catching a glass surface momentarily.

## Visual Behavior

- **Unwatched stories**: Every ~4 seconds, a soft white light sweeps around the border over ~1.5s, then fades out. The cycle repeats indefinitely.
- **Watched stories**: Static dim gradient border, no shimmer -- unchanged.
- **Hover**: Still brightens the shimmer (existing behavior preserved).

## Technical Details

### File: `src/index.css`

**1. Replace the `story-shimmer-rotate` keyframes** with a combined rotation + opacity pulse animation:

```css
@keyframes story-shimmer-rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes story-shimmer-pulse {
  0%   { opacity: 0; }
  10%  { opacity: 0.8; }
  35%  { opacity: 0.8; }
  50%  { opacity: 0; }
  100% { opacity: 0; }
}
```

The pulse keyframes control visibility: the shimmer fades in quickly, stays visible for a sweep, then fades out and stays hidden for the remainder of the cycle.

**2. Update `.story-shimmer-border::before`**:

- Remove the static `opacity: 0` and `transition: opacity`
- Apply two animations simultaneously: the rotation (continuous spin) and the pulse (periodic fade in/out)
- The rotation runs at ~3s per full turn; the pulse cycle runs at ~5s total (visible for roughly 1.5-2s, hidden for ~3s)

```css
.story-shimmer-border::before {
  /* ...existing positioning and gradient... */
  animation: 
    story-shimmer-rotate 3s linear infinite,
    story-shimmer-pulse 5s ease-in-out infinite;
  will-change: transform, opacity;
  pointer-events: none;
}
```

**3. Keep the hover rule** so hovering still forces full brightness:

```css
.story-shimmer-border:hover::before {
  opacity: 1;
  animation-name: story-shimmer-rotate; /* stop the pulse, stay bright */
}
```

### No component changes needed

`ShimmerBorder`, `StoriesBar.tsx`, and `ProfilePage.tsx` already apply the `story-shimmer-border` class correctly. This is a CSS-only change.

### Summary

| File | Change |
|------|--------|
| `src/index.css` | Add `story-shimmer-pulse` keyframes; update `.story-shimmer-border::before` to use dual animation (rotate + pulse); adjust hover to override pulse |

