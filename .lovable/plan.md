

# Fix: Category Carousel Swipe Conflicting with Page Tab Switch

## Problem Analysis

The current `stopPropagation()` approach on React synthetic events is unreliable because:

1. **React synthetic events** use a single delegated listener at the root. When both the bento wrapper and the HomePage feed container use React `onTouchMove` handlers, the native event has already been captured at the root before React dispatches synthetic events down the tree. In some cases (especially with framer-motion's `AnimatePresence` wrapping the filter panel), the propagation stopping doesn't reliably prevent the parent's swipe logic from executing.

2. **The real fix** requires using **native DOM event listeners** with `{ capture: true }` or attaching directly to the element, which intercepts the touch at the browser level before React's delegation system processes it.

## Solution

### 1. Add `touch-action: pan-x` CSS to all scrollable filter rows (HomeFeed.tsx)

On each `overflow-x-auto` div inside `SortFilterSection`, add the CSS class `touch-action-pan-x` (or inline style `touchAction: 'pan-x'`). This tells the browser "this element handles horizontal touch gestures natively" and prevents vertical scroll interference.

### 2. Replace React synthetic `stopPropagation` with a native `useEffect` listener on the bento wrapper

Instead of React's `onTouchStart/Move/End` with `stopPropagation`, attach native event listeners via a `ref` + `useEffect` on the bento `div`. Native listeners fire before React's delegated system and can reliably call `e.stopPropagation()` to prevent the touch from ever reaching the HomePage's handlers.

### 3. Update the HomePage swipe handler to check target context

As a safety net, modify `handleTouchEnd` in `HomePage.tsx` to check if the touch originated inside a scrollable filter area (using a data attribute like `data-no-swipe`). If so, skip the tab-switch logic entirely.

## Files to Change

- **`src/components/app/feeds/HomeFeed.tsx`**
  - Add a `ref` to the bento wrapper div
  - Replace inline `onTouchStart/Move/End` with a `useEffect` that attaches native listeners with `stopPropagation` and `stopImmediatePropagation`
  - Add `touch-action: pan-x` style to each `overflow-x-auto` scrollable row
  - Add `data-no-swipe` attribute to the bento wrapper

- **`src/pages/app/HomePage.tsx`**
  - In `handleTouchStart`, check if `e.target` is inside a `[data-no-swipe]` element; if so, skip recording start coordinates
  - In `handleTouchEnd`, add a guard that bails if touch refs are null (already partially there, but reinforce)

## Technical Details

```text
Touch event flow (current - broken):
  Browser -> React root delegate -> synthetic dispatch -> parent fires FIRST
  
Touch event flow (fixed):
  Browser -> native listener on bento (stopPropagation) -> event never reaches parent
```

The key change in HomeFeed.tsx bento wrapper:

```typescript
const bentoRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const el = bentoRef.current;
  if (!el) return;
  
  const stop = (e: TouchEvent) => {
    e.stopPropagation();
  };
  
  el.addEventListener('touchstart', stop, { passive: true });
  el.addEventListener('touchmove', stop, { passive: true });
  el.addEventListener('touchend', stop, { passive: true });
  
  return () => {
    el.removeEventListener('touchstart', stop);
    el.removeEventListener('touchmove', stop);
    el.removeEventListener('touchend', stop);
  };
}, []);
```

And the safety check in HomePage.tsx `handleTouchStart`:

```typescript
const handleTouchStart = (e: React.TouchEvent) => {
  const target = e.target as HTMLElement;
  if (target.closest('[data-no-swipe]')) return; // Skip if inside filter panel
  
  touchStartX.current = e.touches[0].clientX;
  // ...rest
};
```

This two-layer approach (native stopPropagation + parent guard) ensures the swipe never triggers when interacting with the filter panel, regardless of event delegation quirks.
