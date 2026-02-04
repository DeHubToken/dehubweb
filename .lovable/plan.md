
# Fix: Post Page Not Starting at Top

## Problem
When clicking on a post from the feed, the dedicated post page starts at a position slightly below the top instead of at the very top. This creates a jarring UX where users have to scroll up to see the full post.

## Root Cause
The `SinglePostPage` component uses a regular `useEffect` to scroll to top, but this runs **after** the browser paints the page. Combined with the overlay pattern's scroll restoration logic in `AppLayout`, there's a timing conflict that prevents the scroll-to-top from working reliably.

## Solution
Change the scroll-to-top logic in `SinglePostPage` to use `useLayoutEffect` (runs before paint) and apply a more aggressive multi-target scroll approach that matches the pattern used elsewhere in the app.

---

## Changes Required

### 1. Update `SinglePostPage.tsx`

**Replace `useEffect` with `useLayoutEffect`** for the scroll-to-top logic, and use the same multi-target scroll approach that works in other parts of the app.

```tsx
// BEFORE (problematic)
useEffect(() => {
  if (navigationType === 'PUSH') {
    window.scrollTo(0, 0);
  }
}, [id, navigationType]);

// AFTER (fixed)
useLayoutEffect(() => {
  if (navigationType === 'PUSH') {
    // Multi-target scroll for maximum compatibility
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    
    // Extra RAF attempt to override browser restoration
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  }
}, [id, navigationType]);
```

**Key changes:**
- **`useLayoutEffect`** - Runs synchronously before the browser paints, preventing the flash at wrong scroll position
- **Multi-target scroll** - Targets `window`, `documentElement`, and `body` to ensure compatibility across all browsers
- **`requestAnimationFrame`** fallback - Extra attempt after the initial render to catch any browser restoration interference

---

## Why This Works

1. **`useLayoutEffect` timing** - By running before paint, we scroll to top BEFORE the user sees anything, eliminating the visual jump
2. **Multi-target approach** - Some browsers (especially Safari) respond differently to scroll targets, so hitting all three ensures it works everywhere
3. **RAF fallback** - Catches edge cases where the browser's native scroll restoration fires slightly after our initial scroll

---

## Files Modified
- `src/pages/app/SinglePostPage.tsx` - Update scroll-to-top logic
