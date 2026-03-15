

## Problem

`GlobalFeedNav` passes `layoutKey={`global-${activeTab}`}` to `GlassIndicator`. When navigating from another page back to home, `activeTab` changes from `''` to `'home'`, which changes the `layoutKey`. This resets the settle counter — but the `rect` also jumps from an invalid/stale position to the home button's position. The settle threshold logic can't reliably distinguish this from a user click, and under certain timing conditions the transition fires, causing the indicator to visibly slide into position.

The root cause is the same one already fixed for `HomePage.tsx`: **`layoutKey` should NOT include `activeTab`**, because changing `layoutKey` on every tab switch defeats the purpose of the settle/transition logic.

Additionally, the settle-count heuristic is fragile. A cleaner approach: **signal transitions explicitly from click handlers** rather than trying to infer user intent from rect changes.

## Plan

### 1. Stabilize `layoutKey` in `GlobalFeedNav` (line 90)
Change `layoutKey={`global-${activeTab}`}` to a stable key like `layoutKey="global-nav"`. This prevents GlassIndicator from resetting its state on every tab/page change.

### 2. Replace settle-count heuristic in `GlassIndicator` with explicit signal
- Add an `enableTransition` prop (boolean) to `GlassIndicator`
- Remove the `settleCountRef`, `SETTLE_THRESHOLD`, and the auto-detection `useEffect`
- When `enableTransition` is true, use the smooth transition; when false, use `'none'`
- Reset `enableTransition` to false automatically after `layoutKey` changes (handled by parent)

### 3. Drive transitions from click handlers in `GlobalFeedNav`
- Add a `transitionEnabled` state, initially `false`
- Set it to `true` inside `handleTabClick` when switching tabs on the home page
- Reset it to `false` when `isHomePage` changes (navigating away/back)
- Pass `enableTransition={transitionEnabled}` to `GlassIndicator`

### 4. Apply same pattern in `HomePage.tsx`
- Same approach: `enableTransition` state set `true` only on explicit tab clicks, reset on mount/layout changes

This eliminates all heuristic timing issues — transitions only happen when the user explicitly clicks a different tab.

