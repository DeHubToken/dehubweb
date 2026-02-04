
# Buttery Smooth Shorts Transition Fix

## Problem
When flicking between shorts, there's a slight "jump" or "shake" at the end of the transition just as the new video starts. This is jarring and breaks the smooth scrolling experience.

## Root Causes Identified
1. **Spring animation overshoot** - The current spring physics (stiffness: 200, damping: 35) still allows some bounce/overshoot at the end of the animation
2. **Dual transform issue** - The `translateY` for drag offset combines with the percentage-based `y` position, creating competing transforms
3. **Video play timing** - Video starts playing immediately when `isActive` becomes true, which happens during the transition rather than after it settles

## Solution

### 1. Switch to Tween Animation with Ease-Out
Replace the spring transition with a tween-based transition using a smooth ease-out curve. This eliminates any bounce/overshoot and creates a predictable, buttery landing:

```typescript
const SMOOTH_TRANSITION = {
  type: 'tween',
  duration: 0.35,
  ease: [0.25, 0.1, 0.25, 1], // CSS ease-out equivalent
};
```

### 2. Delay Video Playback Until Animation Settles
Add a small delay before starting video playback to ensure the transition has fully completed:

```typescript
// In VideoSlide.tsx
useEffect(() => {
  const video = videoRef.current;
  if (!video) return;

  if (isActive) {
    // Delay playback slightly to let transition settle
    const timer = setTimeout(() => {
      if (video.currentTime === 0 || video.ended) {
        video.currentTime = 0;
      }
      video.play().catch(() => {});
    }, 50); // 50ms delay for buttery landing
    
    return () => clearTimeout(timer);
  } else {
    video.pause();
  }
}, [isActive]);
```

### 3. Use CSS Transform Instead of Framer Motion translateY
Simplify the transform by only using the percentage-based `y` prop and removing the additional `translateY` during animation. The drag offset should only apply during active dragging:

```typescript
animate={{
  y: `${offset * 100}%`,
}}
// Move translateY to a style prop that's conditionally applied
style={{
  transform: dragOffset !== 0 ? `translateY(${isActive ? dragOffset : dragOffset * 0.3}px)` : undefined,
  zIndex: isActive ? 2 : 1,
}}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/app/cards/ShortsViewer.tsx` | Replace spring transition with smooth tween, simplify transform handling |
| `src/components/app/cards/VideoSlide.tsx` | Add 50ms delay before video playback starts |

## Expected Result
- No visible bounce or overshoot at the end of transitions
- Video starts playing only after the slide has fully settled
- Smooth, predictable "slot into place" feel like TikTok/Instagram Reels
