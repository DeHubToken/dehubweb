

## Fix: Hold-to-Refresh Not Working for Fast Scrolls

### Root Cause

The hold timer mechanism is working, but **wheel/trackpad inertia defeats it**. Here's what happens:

1. User does a fast upward scroll gesture
2. Wheel events start firing rapidly (trackpad momentum)
3. `pullDistance` crosses threshold almost instantly
4. Hold timer starts and runs for 420ms
5. **Wheel events keep firing during those 420ms** due to trackpad inertia
6. Timer completes → Refresh triggers
7. User perceives this as "instant refresh on fast scroll"

The timer IS running for 420ms - but the continuous wheel events during inertia make the gesture appear "active" the whole time.

---

### Solution: Velocity-Based Detection

Instead of (or in addition to) a hold timer, we need to detect the **speed** of the gesture. Fast, aggressive scrolls should NOT trigger refresh, only slow, deliberate pulls.

**Implementation:**

1. Track the velocity of the pull gesture
2. Only start the hold timer if velocity drops below a threshold (slow pull)
3. Fast swipes will never meet the velocity requirement

---

### Technical Implementation

**Add velocity tracking to `use-pull-to-refresh.ts`:**

```typescript
// New constants
const HOLD_DURATION_MS = 420;
const MAX_VELOCITY_FOR_REFRESH = 0.5; // pixels per millisecond - slow pulls only
const VELOCITY_SAMPLE_MS = 100; // How often to sample velocity

// New refs
const lastPullDistance = useRef<number>(0);
const lastPullTime = useRef<number>(0);
const currentVelocity = useRef<number>(0);
```

**Velocity calculation in touch/wheel handlers:**

```typescript
// In handleTouchMove/handleWheel:
const now = Date.now();
const timeDelta = now - lastPullTime.current;

if (timeDelta > 0) {
  const distanceDelta = resistedDistance - lastPullDistance.current;
  currentVelocity.current = Math.abs(distanceDelta / timeDelta);
}

lastPullDistance.current = resistedDistance;
lastPullTime.current = now;

// Only start hold timer if:
// 1. At threshold
// 2. Velocity is LOW (user is pulling slowly/deliberately)
if (resistedDistance >= pullThreshold && currentVelocity.current < MAX_VELOCITY_FOR_REFRESH) {
  startHoldTimer();
} else {
  cancelHoldTimer();
}
```

**For wheel events specifically - disable entirely or add stricter velocity check:**

The wheel handler is particularly problematic because trackpad inertia creates a stream of events. Options:

- **Option A**: Disable wheel-based pull-to-refresh entirely (touch-only)
- **Option B**: Require wheel velocity to stay low for the full 420ms
- **Option C**: Require the wheel to "pause" (no events for 200ms) while at threshold

I recommend **Option A + velocity check for touch** - this removes the most problematic trigger (trackpad) while keeping intentional touch pulls.

---

### Files to Modify

| File | Change |
|------|--------|
| `src/hooks/use-pull-to-refresh.ts` | Add velocity tracking, disable wheel-based refresh, only trigger on slow deliberate pulls |

---

### Updated Logic Flow

```text
User pulls down
    ↓
Is velocity < 0.5 px/ms? (slow, deliberate)
    ├─ No → Do nothing, just show visual feedback
    └─ Yes → Start 420ms hold timer
                ↓
         User keeps holding slowly for 420ms?
              ├─ No (velocity increases or releases early) → Cancel, no refresh
              └─ Yes → Trigger refresh
```

---

### Code Changes Summary

1. **Add velocity tracking** - measure how fast the user is pulling
2. **Only start hold timer on slow pulls** - fast scrolls never start the timer
3. **Disable wheel-based refresh** - remove the wheel handler entirely (touch only)
4. **Reset velocity on release** - clean state for next gesture

This ensures that aggressive "scroll to top" gestures will never trigger refresh, only slow deliberate "pull and hold" gestures will.

