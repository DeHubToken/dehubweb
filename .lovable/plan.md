

# Fix Medal Shimmer Breaking During Auto-Rotation

## Root Cause

The medal shine animation (`medal-sweep`) runs on an **8-second cycle**, but the leaderboard auto-rotates every **5 seconds**. Each rotation triggers a React re-render that either:
- Remounts the medal DOM elements (if the top-3 users change between periods), restarting the animation from 0%
- Causes a brief layout recalculation that disrupts the animation timing

Since the sweep only fires between 80%-90% of the 8s cycle (i.e., at ~6.4s-7.2s), the 5-second rotation resets it before the shine ever appears.

## Fix

### 1. Shorten the animation cycle to fit within the rotation window
**File**: `src/index.css` (line 342)

Change the animation duration from `8s` to `3s` so the shine sweep completes well within each 5-second rotation window. Adjust the keyframe percentages so the sweep still feels natural:

```css
animation: medal-sweep 3s ease-in-out infinite;
```

Update the keyframes (lines 354-361) to:
```css
@keyframes medal-sweep {
  0%, 60%, 100% {
    background-position: 100% 0;
  }
  80% {
    background-position: -100% 0;
  }
}
```

This ensures the shine sweeps once every 3 seconds, completing at least one full cycle before the next rotation at 5 seconds.

### 2. Add `animation-fill-mode` to prevent flicker on remount
**File**: `src/index.css` (line 342, same block)

Add to `.medal-shine-overlay`:
```css
animation-fill-mode: both;
```

This ensures even if the element remounts, it starts from a clean visual state without a flash.

## Summary
- Single file change: `src/index.css`
- Shortens medal animation cycle from 8s to 3s so it completes before the 5s auto-rotation resets it
- Adds `animation-fill-mode: both` to prevent visual glitches on remount

