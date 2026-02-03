
## Fix: Velocity Detection Using Raw Touch Distance

### Root Cause Identified

The velocity calculation is flawed because it measures velocity on **`resistedDistance`** (the capped visual value) instead of the **raw touch movement**.

**What happens with a fast swipe:**
1. User swipes down 300px in 200ms (fast!)
2. `resistedDistance = Math.min(300 * 0.5, 80 * 1.5) = 120px` (capped)
3. Velocity calculated as `120px / 200ms = 0.6 px/ms`
4. This is below the `0.8 px/ms` threshold → appears "slow"
5. Hold timer starts → 420ms passes during the gesture → refresh triggers

The resistance formula (`* 0.5` and `max 120px`) **artificially flattens the velocity curve**, making all gestures appear slow once they approach the threshold.

---

### Solution: Track Raw Touch Velocity

Calculate velocity from the **raw touch coordinates**, not the resisted distance. A fast 300px swipe should register as fast, regardless of visual capping.

---

### Implementation

**File: `src/hooks/use-pull-to-refresh.ts`**

**1. Track raw touch Y position for velocity, not resistedDistance:**

```typescript
// New ref to track raw touch position
const lastRawTouchY = useRef<number>(0);

// Update velocity calculation to use raw touch delta
const updateVelocity = useCallback((rawTouchY: number) => {
  const now = Date.now();
  const timeDelta = now - lastPullTime.current;
  
  if (timeDelta > 0 && lastPullTime.current > 0) {
    // Use RAW touch delta, not the resisted/capped distance
    const rawDelta = Math.abs(rawTouchY - lastRawTouchY.current);
    currentVelocity.current = rawDelta / timeDelta;
  }
  
  lastRawTouchY.current = rawTouchY;
  lastPullTime.current = now;
}, []);
```

**2. In handleTouchMove, pass the raw touch Y:**

```typescript
const handleTouchMove = useCallback((e: React.TouchEvent) => {
  // ... existing checks ...
  
  const currentY = e.touches[0].clientY;
  const distance = currentY - pullStartY.current;
  
  if (distance > 0) {
    const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
    setPullDistance(resistedDistance);
    setIsPulling(true);
    
    // Track velocity using RAW touch position, not resisted distance
    updateVelocity(currentY);
    
    // ... rest of logic ...
  }
}, [/* deps */]);
```

**3. Also lower the velocity threshold:**

The current threshold of `0.8 px/ms` is quite permissive. A more typical "slow" pull is around `0.3-0.5 px/ms`.

```typescript
const MAX_VELOCITY_FOR_REFRESH = 0.4; // pixels per ms - stricter for deliberate pulls
```

---

### Updated Logic

| Gesture | Raw Delta | Time | Velocity | Result |
|---------|-----------|------|----------|--------|
| Fast scroll | 300px | 200ms | 1.5 px/ms | Too fast → no timer |
| Quick flick | 150px | 100ms | 1.5 px/ms | Too fast → no timer |
| Slow pull | 160px | 500ms | 0.32 px/ms | Slow → timer starts |
| Deliberate hold | 80px | 300ms | 0.27 px/ms | Slow → timer starts |

---

### Files to Modify

| File | Change |
|------|--------|
| `src/hooks/use-pull-to-refresh.ts` | Fix velocity to use raw touch coordinates, lower velocity threshold |

---

### Code Changes Summary

1. **Add `lastRawTouchY` ref** to track raw touch position
2. **Update `updateVelocity`** to accept raw Y coordinate and calculate true velocity  
3. **Pass raw `currentY`** to updateVelocity instead of resistedDistance
4. **Lower threshold** from 0.8 to 0.4 px/ms for more accurate detection
5. **Reset `lastRawTouchY`** in `handleTouchStart` and cleanup functions
