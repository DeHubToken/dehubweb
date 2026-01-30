

# Smarter Pull-to-Refresh: Preventing Accidental Triggers

## The Problem
Currently, the pull-to-refresh triggers too easily when you naturally scroll to the top of the feed. This happens because:
- Any upward scroll motion (wheel/trackpad) at the top starts accumulating toward a refresh
- Touch gestures don't require enough intentional "pull" distance
- There's no cooldown between refreshes

## Solution Overview
Make pull-to-refresh require **deliberate intent** rather than triggering from normal scrolling:

1. **Require a "pause at top"** - User must stop scrolling for ~200ms at the top before pull-to-refresh becomes active
2. **Increase pull threshold** - Make the required distance larger (120px instead of 80px)
3. **Add refresh cooldown** - Prevent triggering more than once every 3 seconds
4. **Remove wheel/trackpad refresh entirely** - Only allow touch/mouse drag gestures (standard mobile pattern)

## Visual Indicator
```text
Current behavior:
  Scroll up → Immediately shows pull indicator → Triggers refresh

New behavior:
  Scroll up → Reach top → Wait 200ms → THEN pull down → Shows indicator → Triggers refresh
```

## Technical Changes

### File: `src/hooks/use-pull-to-refresh.ts`

**Changes:**
1. Add a `topSettleTime` ref to track when user first reached the top
2. Add `SETTLE_DELAY` constant (200ms) - time user must stay at top before pull activates
3. Add `lastRefreshTime` ref with 3-second cooldown between refreshes
4. Remove wheel-based refresh entirely (wheel scrolling should just scroll, not refresh)
5. Increase default `pullThreshold` from 80 to 120

**New logic flow:**
- When user reaches top of page → start a 200ms timer
- If user scrolls away before timer completes → reset timer
- Only after 200ms at top → enable pull-to-refresh
- Touch/mouse drag downward then shows the pull indicator
- Releasing past threshold triggers refresh (if cooldown allows)

### File: `src/pages/app/HomePage.tsx`

**Changes:**
1. Update `PULL_THRESHOLD` from 80 to 120
2. No other changes needed - the hook handles the improved logic

## Why This Works
- **Normal scrolling**: You scroll up, hit the top, and the inertia naturally stops. Since you don't pause and deliberately pull down, no refresh triggers
- **Intentional refresh**: You scroll to top, wait a moment (natural pause), then pull down deliberately → refresh triggers
- **Matches user expectation**: This matches how apps like Twitter/Instagram handle pull-to-refresh

## Edge Cases Handled
- Fast flick scrolling that bounces at top → No refresh (no settle time)
- Trackpad momentum scrolling at top → No refresh (wheel events ignored)
- Quick up-down scroll at top → No refresh (didn't settle + no downward pull)
- Deliberately pull down after pausing → Refresh works as expected

