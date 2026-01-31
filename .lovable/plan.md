
# Fix Mobile Nav Border on Shorts Playback

## Problem
When viewing Shorts in fullscreen mode on mobile, a visible "border" appears around the bottom navigation bar. This is caused by:

1. The `MobileBottomNav` container has `p-2` (8px padding) which creates space around the nav element
2. The nav itself has `border border-white/10` which adds a subtle white border
3. The Shorts viewer has `z-50`, same as the nav, allowing the nav to remain visible on top
4. Against the pure black background of the Shorts viewer, this padding gap becomes visible as a border artifact

## Solution

Hide the `MobileBottomNav` completely when the Shorts viewer is open. Since the Shorts viewer already has its own navigation and action buttons, the bottom nav is redundant and creates visual clutter.

### Implementation

**File: `src/components/app/MobileBottomNav.tsx`**

1. Add a listener for when ShortsViewer is active by checking if a Shorts viewer element exists in the DOM
2. Use a state variable to track visibility
3. Return `null` when Shorts are being viewed

```text
Changes to MobileBottomNav.tsx:
- Add useEffect to detect when ShortsViewer is open (checks for fixed z-50 element with bg-black)
- Alternatively: Use a custom event or context to track Shorts viewer state
- Hide the entire nav when Shorts are playing
```

### Alternative Approach (Simpler)

Since the ShortsViewer is positioned `fixed inset-0 z-50`, we can simply increase its z-index to be above the MobileBottomNav, OR decrease the MobileBottomNav z-index to be below.

**Recommended fix:**
- Change ShortsViewer's z-index from `z-50` to `z-[60]` so it fully covers the MobileBottomNav

This is the simpler, cleaner solution that requires minimal code changes.

---

## Technical Details

| File | Change |
|------|--------|
| `src/components/app/cards/ShortsViewer.tsx` | Change `z-50` to `z-[60]` on the main container (line 416) |

### Code Change

```typescript
// Line 416 in ShortsViewer.tsx
// From:
className="fixed inset-0 z-50 bg-black flex items-center justify-center"

// To:
className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
```

This ensures the Shorts viewer fully covers all other UI elements including the bottom navigation, eliminating the border artifact completely.
