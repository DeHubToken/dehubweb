
# Fix: Audio Preview Stopping After a Few Seconds

## Problem Identified

After analyzing the code, I found the root cause of why audio stops after a few seconds in the post modal:

The `AudioVisualizer` component has a **race condition** in how it attaches the `ended` event listener to the audio element. The listener is added in a `useEffect` that depends on `[onPlayPause, isInitialized]`:

```javascript
useEffect(() => {
  const audio = audioRef.current;
  if (!audio) return;

  const handleEnded = () => {
    onPlayPause();
  };

  audio.addEventListener('ended', handleEnded);
  return () => audio.removeEventListener('ended', handleEnded);
}, [onPlayPause, isInitialized]);
```

**The issue:** When `onPlayPause` is passed from the parent component, it's recreated on each render because it's defined inline:

```javascript
onPlayPause={() => {
  if (playingIndex === index) {
    setPlayingIndex(null);
  } else {
    setPlayingIndex(index);
  }
}}
```

This causes the `useEffect` to run frequently, detaching and re-attaching the `ended` listener. If the audio happens to end during this transition, the event is missed - but more critically, **the frequent re-renders may cause the audio to be unintentionally paused**.

Additionally, the playback effect at lines 141-153 has `draw` in its dependencies, which changes when `style` or `hue` changes. This can cause unwanted pause/play cycles.

---

## Solution

### 1. Stabilize the `onPlayPause` callback in PostMediaPreview

Wrap the callback in `useCallback` to prevent unnecessary re-renders affecting the audio element.

### 2. Fix the AudioVisualizer event listener management

Move the `ended` event listener setup into the `setupAudio` function so it's attached immediately when the audio element is created, rather than in a separate effect that can be out of sync.

### 3. Remove `draw` from the playback effect dependencies

The playback effect should only depend on `isPlaying`, not on `draw`. The drawing is already triggered separately.

---

## Technical Changes

### File: `src/features/post/components/PostMediaPreview.tsx`

Create a memoized callback for the audio play/pause toggle:

```typescript
// Add near the top of the component, around line 100
const handleAudioVisualizerPlayPause = useCallback((index: number) => {
  setPlayingIndex(prev => prev === index ? null : index);
}, []);
```

Update the AudioVisualizer usage (around line 474):
```typescript
<AudioVisualizer
  audioUrl={m.preview}
  isPlaying={playingIndex === index}
  onPlayPause={() => handleAudioVisualizerPlayPause(index)}
  // ... rest of props
/>
```

### File: `src/components/app/audio/AudioVisualizer.tsx`

1. **Move the `ended` listener into `setupAudio`** (around line 58-90):

```typescript
const setupAudio = useCallback(() => {
  if (isConnectedRef.current) return;

  try {
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.crossOrigin = 'anonymous';
      
      // Attach ended listener immediately when creating audio
      audioRef.current.addEventListener('ended', () => {
        onPlayPause();
      });
    }
    // ... rest of setup
  } catch (err) {
    console.error('Failed to setup audio:', err);
  }
}, [audioUrl, onPlayPause]);
```

2. **Fix the playback effect** - remove `draw` from dependencies (lines 141-153):

```typescript
useEffect(() => {
  if (!audioRef.current) return;

  if (isPlaying) {
    audioRef.current.play().catch(console.error);
  } else {
    audioRef.current.pause();
  }
}, [isPlaying]);

// Separate effect for animation
useEffect(() => {
  if (isPlaying && analyserRef.current) {
    draw();
  } else if (animationRef.current) {
    cancelAnimationFrame(animationRef.current);
  }
}, [isPlaying, draw]);
```

3. **Remove the separate ended listener effect** (lines 182-192) since it's now handled in `setupAudio`.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/app/audio/AudioVisualizer.tsx` | Fix event listener attachment and separate playback/animation effects |
| `src/features/post/components/PostMediaPreview.tsx` | Memoize the play/pause callback to prevent unnecessary re-renders |
