

## Problem

The `GlassFilterRow` component uses an overlay layer with `overflow-visible` so the framer-motion spring bounce animation isn't clipped. But this means when users scroll a long carousel, the glass indicator remains visible outside the container bounds (e.g. sticking out to the left), which looks broken.

## Solution: `overflow: clip` with `overflow-clip-margin`

CSS `overflow: clip` is the perfect middle ground:
- Unlike `overflow: hidden`, it does **not** create a scroll container (won't interfere with the inner scrollable div)
- It clips content that overflows the container bounds
- Combined with `overflow-clip-margin`, we can allow a small bleed area (e.g. 8px) so the spring bounce overshoot still looks natural

## Changes

### `src/components/app/feeds/GlassFilterRow.tsx`
- Add `overflow-x: clip` and `overflow-clip-margin: 8px` (via inline style) to the outer container div (line 66)
- This clips the indicator when it's scrolled far outside the viewport, but allows ~8px of spring overshoot
- Keep the indicator layer as `overflow-visible` (no change needed there)

### Same pattern for manual usages
Search for any direct `useTabIndicator` + `GlassIndicator` usage outside of `GlassFilterRow` (e.g. `HomePage.tsx`, `FeaturesPage.tsx`, `ProfilePage.tsx`) and apply the same `overflow-x: clip` style to their outer wrappers.

### Technical detail
```css
/* On the outer container */
overflow-x: clip;
overflow-clip-margin: 8px; /* allows spring bounce bleed */
```

This is a CSS-only fix — no JS logic changes needed. The `overflow-clip-margin` property has good browser support (Chrome 90+, Firefox 102+, Safari 16+).

