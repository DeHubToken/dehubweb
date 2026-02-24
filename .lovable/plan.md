

## Plan: Fix Post Modal Scroll Blocking When Video is Added

### Problem
When a video is added to the post modal, the content area grows to include the video preview and thumbnail options, but users cannot scroll down to see them. The Vaul drawer library intercepts vertical touch/swipe gestures for its swipe-to-dismiss behavior, preventing the inner `overflow-y-auto` container from scrolling.

### Root Cause
The `PostContentArea` wrapper div (line 442-443 of `PostContentArea.tsx`) has `max-h-[60vh] overflow-y-auto`, which should be scrollable. However, Vaul's drawer captures touch events on the content for drag-to-dismiss, overriding the native scroll behavior of the inner container.

### Solution
Add `data-vaul-no-drag` attribute to the scrollable content container in `PostContentArea.tsx`. This is Vaul's built-in escape hatch — it tells the drawer to not intercept drag/touch events on that element, allowing native scrolling to work.

### Changes

**File: `src/features/post/components/PostContentArea.tsx`** (line 442-443)
- Add `data-vaul-no-drag` to the scrollable `div` that wraps the post content:
```tsx
<div 
  className="p-4 max-h-[60vh] overflow-y-auto relative"
  data-vaul-no-drag
  onDragEnter={handleDragEnter}
  ...
>
```

This is a single-line attribute addition. No other files need to change.

### Technical Detail
`data-vaul-no-drag` is a documented Vaul feature that prevents the drawer's drag handler from capturing pointer/touch events on the marked element and its descendants, allowing native scroll to take over. This won't affect the drawer's ability to be dismissed by dragging the handle area or overlay.

