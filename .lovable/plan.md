

# Fix Desktop Pinch-Zoom Panning Issue

## Problem Identified

After removing the viewport restrictions (`maximum-scale=1.0, user-scalable=no`), pinch-zoom now works in some areas, but panning after zooming is still blocked. This is because of `touch-action: pan-x pan-y` applied in multiple places:

1. **`src/index.css`** - Lines 169 and 178 on `html` and `body`
2. **`src/components/app/AppLayout.tsx`** - Inline style on line 22

The `pan-x pan-y` value explicitly excludes the `pinch-zoom` gesture, which also affects desktop trackpad behavior in some browsers.

## Solution

Change `touch-action: pan-x pan-y` to `touch-action: manipulation` in both locations.

**Why `manipulation`?**
- Allows panning (scrolling) and pinch-zoom
- Disables double-tap-to-zoom (prevents the 300ms click delay)
- Standard approach for touch-friendly web apps that still allow zoom

## Files to Modify

### 1. `src/index.css`

Update the `html, body` rule and the `body` rule:

```css
html, body {
  height: 100%;
  width: 100%;
  background-color: black;
  overscroll-behavior: none;
  overscroll-behavior-y: none;
  touch-action: manipulation;  /* Changed from pan-x pan-y */
  -webkit-overflow-scrolling: touch;
}

body {
  background-color: black;
  overflow-x: hidden;
  overscroll-behavior-y: none;
  touch-action: manipulation;  /* Changed from pan-x pan-y */
}
```

### 2. `src/components/app/AppLayout.tsx`

Update the inline style on the main container:

```tsx
<div 
  className="min-h-screen bg-black text-white overflow-x-clip" 
  style={{ touchAction: 'manipulation', overscrollBehavior: 'none' }}
>
```

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mobile swipe gestures affected | Low | `manipulation` still allows panning; existing `SwipeableCarousel` isolation will continue to work |
| Accidental zoom on mobile | Low | Double-tap-to-zoom is disabled by `manipulation`, which is actually a benefit |
| Tab switching conflicts | None | The gesture isolation logic (`SwipeableCarousel`, `gesture-state.ts`) operates at a higher level and is unaffected |

## Expected Result

After this change:
- Desktop trackpad pinch-zoom will work fully (zoom in + pan around)
- Mobile touch gestures (swipe tabs, scroll, carousel navigation) will remain functional
- Pull-to-refresh will continue to work
- No accidental double-tap zooming

