

# SafePal Fullscreen Bug

## Root Cause

SafePal's in-app browser (Android WebView) exposes `requestFullscreen` on DOM elements, so the check at line 755 passes. However, the call silently fails or is blocked by the WebView. Because the code does `return` on line 757 immediately after calling `requestFullscreen()`, it never reaches the simulated fullscreen fallback at line 765.

The same issue likely applies to `webkitRequestFullscreen`.

## Fix

In `src/components/app/cards/VideoCard.tsx`, change the container fullscreen logic to use promise-based error handling. If `requestFullscreen()` rejects (which it does in restricted WebViews like SafePal), catch the error and fall through to the simulated fullscreen.

```text
Current flow:
  requestFullscreen() → return (even if it fails silently)

Fixed flow:
  requestFullscreen().catch(() → setIsFullscreen(true))
```

### Changes to `src/components/app/cards/VideoCard.tsx` (lines 753-765)

Replace the container fullscreen block with:

```typescript
// Standard Fullscreen API on container — with fallback if blocked
if (containerEl) {
  const tryFullscreen = containerEl.requestFullscreen
    ? containerEl.requestFullscreen()
    : containerEl.webkitRequestFullscreen
      ? containerEl.webkitRequestFullscreen()
      : null;

  if (tryFullscreen && typeof tryFullscreen.catch === 'function') {
    tryFullscreen.catch(() => {
      // Fullscreen API exists but was blocked (e.g. SafePal WebView)
      setIsFullscreen(true);
    });
    return;
  }

  if (tryFullscreen) return; // non-promise success (shouldn't happen per spec)
}

// Fallback: simulated fullscreen
setIsFullscreen(true);
```

This ensures SafePal (and any other restricted WebView) gracefully falls back to the CSS-based simulated fullscreen overlay instead of silently failing.

