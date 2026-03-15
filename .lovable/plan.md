

## Problem

When navigating from any non-home page (e.g., Explore) back to `/app` via the logo, the `GlobalFeedNav` glass indicator visibly slides/flashes into position instead of appearing instantly. 

**Root cause:** When `activeTab` changes from `''` (non-home) to `'home'`, the `GlassIndicator`'s `layoutKey` effect resets its state, but `useTabIndicator`'s 700ms tracking loop (`hasMountedRef` is already `true`) continuously updates the rect. During layout settling, small shifts exceed the 5px threshold, flipping `userHasSwitched = true` and enabling CSS transitions — causing the visible slide.

## Fix

**In `GlassIndicator.tsx`**: After a `layoutKey` change, enforce a suppression window (~300ms) where transitions are forced to `'none'` regardless of position changes. This ensures the indicator snaps to position instantly when navigating between pages, while still allowing smooth transitions for actual user tab clicks within the same page context.

**Changes:**
- Add a `suppressedRef` that gets set to `true` on `layoutKey` change
- Set a timeout to clear it after 300ms  
- Use `transition: 'none'` whenever `suppressedRef.current` is true, overriding `userHasSwitched`

Single file change: `src/components/app/feeds/GlassIndicator.tsx`

