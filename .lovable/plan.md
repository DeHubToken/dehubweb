
# Fix Slow Sidebar Swipe Response

## Problem
The 2-finger trackpad swipe on the sidebar panel feels slow for two reasons:

1. **100ms debounce delay** on the wheel handler -- it waits 100ms after the last wheel event before processing the accumulated delta. This adds noticeable lag before anything happens.
2. **300ms slide animation** on leaderboard period changes (via `AnimatePresence` + `motion.div`) -- after the delay, you then wait for the animation to complete.

Combined, there's nearly 400ms of perceived delay.

## Fix

### 1. Reduce wheel debounce from 100ms to 40ms
The 100ms timeout was overly conservative. 40ms is enough to batch trackpad inertia events while feeling near-instant.

**File:** `src/components/app/sidebar/TabbedSidePanel.tsx`
- Change `setTimeout(..., 100)` to `setTimeout(..., 40)`

### 2. Speed up leaderboard period transition animation
Reduce the slide animation duration from 300ms to 150ms so period switches feel snappy.

**File:** `src/components/app/sidebar/SidebarLeaderboard.tsx`  
- Change `transition={{ duration: 0.3, ... }}` to `transition={{ duration: 0.15, ... }}`

### 3. Add a cooldown to prevent double-firing
Add a ref-based cooldown (~300ms) after each swipe fires, so trackpad inertia doesn't trigger multiple consecutive swipes. This replaces the need for a long debounce.

**File:** `src/components/app/sidebar/TabbedSidePanel.tsx`
- Add a `lastSwipeTime` ref
- Skip processing if within cooldown window

## Summary of Changes
| File | Change |
|------|--------|
| `TabbedSidePanel.tsx` | Reduce wheel debounce to 40ms, add 300ms cooldown between swipes |
| `SidebarLeaderboard.tsx` | Reduce animation duration to 150ms |
