
# Fix: Pull-to-Refresh Firing Twice

## Problem Summary

The pull-to-refresh animation on the Profile page fires twice on mobile and sometimes on desktop. Users see two pull-down animations and two reload operations.

## Root Cause Analysis

The issue stems from **race conditions** in the `usePullToRefresh` hook:

1. **Async State Guard**: The `triggerRefresh` function checks `isRefreshing` state, but React state updates are asynchronous. Multiple events can call `triggerRefresh()` before the state updates.

2. **Mobile Touch Events**: On mobile, browsers can fire multiple rapid touch events during a single swipe gesture (especially with overscroll/bounce effects).

3. **Trackpad Inertia**: On desktop trackpads, inertial scrolling fires many wheel events in quick succession. The accumulator can reset and rebuild fast enough to trigger multiple refreshes.

```
Current Flow (Buggy):
+---------------+     +---------------+     +---------------+
| Touch/Wheel   | --> | Check state   | --> | onRefresh()   |
| Event 1       |     | isRefreshing  |     | Called        |
+---------------+     | = false ✓     |     +---------------+
                      +---------------+
                              ↓
+---------------+     +---------------+     +---------------+
| Touch/Wheel   | --> | Check state   | --> | onRefresh()   |
| Event 2       |     | isRefreshing  |     | Called AGAIN! |
| (rapid fire)  |     | = false ✓     |     +---------------+
+---------------+     | (not updated  |
                      |  yet!)        |
                      +---------------+
```

## Solution

Add a **synchronous ref-based lock** that updates immediately, preventing any subsequent calls before React state catches up:

```
Fixed Flow:
+---------------+     +---------------+     +---------------+
| Touch/Wheel   | --> | Check REF     | --> | onRefresh()   |
| Event 1       |     | hasTriggered  |     | Called        |
+---------------+     | = false ✓     |     | Set ref=true  |
                      +---------------+     +---------------+
                              ↓
+---------------+     +---------------+
| Touch/Wheel   | --> | Check REF     |
| Event 2       |     | hasTriggered  |
| (rapid fire)  |     | = true ✗      | --> BLOCKED
+---------------+     | (immediately  |
                      |  updated!)    |
                      +---------------+
```

## Technical Changes

### File: `src/hooks/use-pull-to-refresh.ts`

1. **Add a ref-based trigger lock**:
   ```typescript
   const hasTriggeredRef = useRef<boolean>(false);
   ```

2. **Update `triggerRefresh` to use synchronous lock**:
   ```typescript
   const triggerRefresh = useCallback(() => {
     // Synchronous check prevents race conditions
     if (hasTriggeredRef.current || isRefreshing) {
       return;
     }
     hasTriggeredRef.current = true;
     onRefresh();
   }, [isRefreshing, onRefresh]);
   ```

3. **Reset the lock when `isRefreshing` changes to false**:
   ```typescript
   useEffect(() => {
     if (!isRefreshing) {
       hasTriggeredRef.current = false;
     }
   }, [isRefreshing]);
   ```

4. **Add cooldown period after trigger** (extra safety for mobile):
   ```typescript
   const lastTriggerTime = useRef<number>(0);
   const TRIGGER_COOLDOWN_MS = 1000;
   
   const triggerRefresh = useCallback(() => {
     const now = Date.now();
     if (
       hasTriggeredRef.current || 
       isRefreshing || 
       now - lastTriggerTime.current < TRIGGER_COOLDOWN_MS
     ) {
       return;
     }
     hasTriggeredRef.current = true;
     lastTriggerTime.current = now;
     onRefresh();
   }, [isRefreshing, onRefresh]);
   ```

## Summary of Changes

| Change | Purpose |
|--------|---------|
| Add `hasTriggeredRef` | Synchronous lock that updates immediately |
| Add `lastTriggerTime` ref | Cooldown prevents rapid re-triggers |
| Reset ref in `useEffect` | Clear lock when refresh completes |
| 1000ms cooldown | Extra buffer for inertial/bounce events |

## Testing Recommendations

After implementation, verify:
1. On mobile: Single pull-down gesture triggers exactly one refresh
2. On desktop trackpad: Scroll-up at top triggers exactly one refresh
3. On desktop mouse: Click-and-drag pull works correctly
4. Rapid repeated gestures respect the cooldown
5. Animation still feels responsive (no perceivable delay)
