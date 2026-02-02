
# Story Viewer: TikTok-Style Vertical Scroll Feed

## Overview
Transform the story viewer from horizontal tap navigation to a full-screen vertical scroll feed like TikTok. Users scroll down to see the next story, one video per screen.

---

## Current Behavior
- Opens as full-screen modal
- Tap left/right sides to navigate between stories
- Progress bar timer at top for each story
- Horizontal-style navigation with chevron hints

## New Behavior
- Full-screen vertical scroll feed
- Swipe/scroll up to see next story, down for previous
- One video fills the screen at a time with snap scrolling
- Keyboard (Arrow Up/Down) and mouse wheel support
- Progress bar synced to actual video playback
- Same liquid glass header with user info and controls

---

## Technical Implementation

### 1. Replace Navigation Model
**File: `src/components/app/stories/StoryViewerModal.tsx`**

Remove:
- Horizontal tap zones (left/right 1/3 click areas)
- ChevronLeft/ChevronRight navigation hints
- Interval-based progress timer

Add:
- Vertical scroll/swipe navigation using Framer Motion drag
- Mouse wheel handler with debounce (similar to ShortsViewer)
- Video `onTimeUpdate` for real-time progress sync
- Snap-to-story scrolling behavior

### 2. Update Video Progress Bar
Instead of a separate interval timer that estimates progress:
```tsx
onTimeUpdate={(e) => {
  const video = e.currentTarget;
  if (video.duration && isFinite(video.duration)) {
    setProgress((video.currentTime / video.duration) * 100);
  }
}}
```

This keeps the progress bar perfectly synced with actual playback.

### 3. Scroll Navigation Logic
Add these handlers (pattern from ShortsViewer):

```tsx
// Mouse wheel
const handleWheel = (e: WheelEvent) => {
  e.preventDefault();
  e.stopPropagation();
  if (isScrolling) return;
  if (Math.abs(e.deltaY) < 50) return;
  
  setIsScrolling(true);
  if (e.deltaY > 0) goNext();
  else goPrev();
  setTimeout(() => setIsScrolling(false), 500);
};

// Touch swipe via Framer Motion
const handleDragEnd = (_, info: PanInfo) => {
  if (info.offset.y < -100) goNext();
  else if (info.offset.y > 100) goPrev();
};
```

### 4. Keyboard Support
Add Arrow Up/Down and Escape key handlers for desktop users.

### 5. Lock Body Scroll
Prevent background page scrolling when viewer is open:
```tsx
useEffect(() => {
  document.body.style.overflow = 'hidden';
  return () => { document.body.style.overflow = ''; };
}, []);
```

### 6. Video Key for Clean Transitions
Force video remount on story change to ensure clean playback:
```tsx
<video key={currentStory.id} ... />
```

---

## UI Changes

### Remove
- Left/right tap zones
- ChevronLeft/ChevronRight icons
- Multi-story progress segments at top

### Keep
- Header with avatar, username, timestamp
- Pause/Play button
- Delete button (for own stories)
- Close (X) button

### Modify
- Single progress bar (for current story only)
- Add subtle up/down chevron hints on sides

---

## State Changes

```tsx
// Remove
const [videoDuration, setVideoDuration] = useState(30);
const progressRef = useRef<NodeJS.Timeout | null>(null);

// Add
const [isScrolling, setIsScrolling] = useState(false);
```

---

## Files to Modify
1. **`src/components/app/stories/StoryViewerModal.tsx`** - Complete refactor to vertical scroll pattern

---

## Summary
The story viewer will feel just like scrolling through TikTok or Instagram Reels - one story per screen, scroll down for more, with smooth snap transitions and real-time progress tracking synced to video playback.
