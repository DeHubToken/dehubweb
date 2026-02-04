
# Smooth Shorts Transition - TikTok-style Vertical Carousel

## Problem
When swiping/scrolling through shorts, users experience:
1. **Black screen flash** - Video element unmounts or src changes abruptly
2. **Play button flash** - The play indicator appears briefly during transition
3. **No visual continuity** - Videos don't "scroll" together like connected train cars

## Root Cause
The current `ShortsViewer` only renders **one video at a time**:
```tsx
// Current implementation
<video src={currentShort.videoUrl} ... />
```

When `currentIndex` changes, the single `<video>` element's `src` changes, causing the browser to:
1. Clear the current video frame (black flash)
2. Load the new video source
3. Start playing

There's no visual transition - it's an instant swap.

## Solution
Implement a **vertical stack carousel** where multiple videos are pre-rendered and positioned, and navigation is achieved via CSS transforms (like TikTok):

```text
┌─────────────┐
│  Previous   │  ← translateY(-100%)
│   Short     │
├─────────────┤
│   Current   │  ← translateY(0) - visible
│   Short     │
├─────────────┤
│    Next     │  ← translateY(100%)
│   Short     │
└─────────────┘
```

When swiping up/down, the entire stack animates together, creating the "train car" effect.

---

## Implementation Plan

### 1. Create a VideoSlide sub-component
Extract the video + overlays into a reusable component that can be rendered for each visible short:

```tsx
interface VideoSlideProps {
  short: ShortVideo;
  isActive: boolean;
  isMuted: boolean;
  // ... other props
}

function VideoSlide({ short, isActive, isMuted, ... }: VideoSlideProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Play/pause based on isActive
  useEffect(() => {
    if (isActive) {
      videoRef.current?.play().catch(() => {});
    } else {
      videoRef.current?.pause();
    }
  }, [isActive]);
  
  return (
    <div className="absolute inset-0">
      <video ... />
      {/* Overlays */}
    </div>
  );
}
```

### 2. Render a window of 3 videos (prev, current, next)
Instead of one video, render up to 3:

```tsx
const visibleIndices = [
  currentIndex - 1,  // Previous
  currentIndex,      // Current (visible)
  currentIndex + 1,  // Next
].filter(i => i >= 0 && i < shorts.length);

{visibleIndices.map(index => (
  <VideoSlide
    key={shorts[index].id}
    short={shorts[index]}
    isActive={index === currentIndex}
    style={{
      transform: `translateY(${(index - currentIndex) * 100}%)`
    }}
  />
))}
```

### 3. Animate with Framer Motion's `animate` prop
Use Framer Motion to smoothly animate the `translateY` when `currentIndex` changes:

```tsx
<motion.div
  key={short.id}
  initial={false}
  animate={{
    y: `${(index - currentIndex) * 100}%`
  }}
  transition={{
    type: "spring",
    stiffness: 300,
    damping: 30
  }}
>
  <VideoSlide ... />
</motion.div>
```

### 4. Improve drag gesture handling
Use `dragSnapToOrigin` and `onDrag` to provide visual feedback during the swipe, then snap to next/prev on release:

```tsx
<motion.div
  drag="y"
  dragConstraints={{ top: 0, bottom: 0 }}
  dragElastic={0.2}
  onDragEnd={(_, info) => {
    if (info.offset.y < -100 && currentIndex < shorts.length - 1) {
      setCurrentIndex(i => i + 1);
    } else if (info.offset.y > 100 && currentIndex > 0) {
      setCurrentIndex(i => i - 1);
    }
  }}
>
```

### 5. Remove play button indicator during transitions
The `showPlayIndicator` should only appear on tap-to-pause, not during navigation:

```tsx
// Only show on explicit tap, not during auto-play after navigation
const togglePlayPause = () => {
  // Only if not in middle of transition
  if (!isTransitioning) {
    // Show indicator
  }
};
```

### 6. Preload videos for smoother playback
Add `preload="auto"` to adjacent videos:

```tsx
<video
  preload={isActive ? "auto" : "metadata"}
  ...
/>
```

---

## Technical Details

| Aspect | Current | After |
|--------|---------|-------|
| Videos rendered | 1 | 3 (prev/current/next) |
| Transition | Instant swap (flash) | Smooth translateY animation |
| Preloading | None | Adjacent videos preload metadata |
| Play indicator | Shows on every video change | Only on explicit tap-to-pause |
| Drag feedback | None during drag | Container moves with finger |

---

## Files to Modify
- `src/components/app/cards/ShortsViewer.tsx` - Refactor to vertical carousel architecture

---

## Expected Behavior After Fix
1. Swiping up slides current video up and brings next video from below
2. Videos are "attached" and move together like train cars
3. No black flash or loading states visible
4. Adjacent videos are preloaded for instant playback
5. Play/pause indicator only appears on tap, not during navigation
