
# Fix Video Duration Detection in VideoCard

## Problem
Some videos (like post 2385) don't show duration badges because:
1. The API doesn't always return `videoDuration` for every video
2. When `formatDuration()` receives nothing or zero, it returns an empty string
3. `VideoCard` still renders the duration badge even when empty, showing a blank pill

## Solution
Apply the same metadata detection pattern used in `MusicFeed` to `VideoCard`:
1. Detect when API duration is missing or invalid
2. Load video metadata in the background using a hidden video element
3. Extract the actual duration from `loadedmetadata` event
4. Only display the duration badge when there's a valid duration

## Changes

### 1. VideoCard.tsx - Add Duration Detection

Add state and effect to detect duration from video metadata when API doesn't provide it:

```typescript
// Add state for detected duration
const [detectedDuration, setDetectedDuration] = useState<string | null>(null);

// Detect duration from video metadata if not provided by API
useEffect(() => {
  const apiDuration = video.duration;
  // Skip if we already have a valid duration
  if (apiDuration && apiDuration !== '0:00' && apiDuration !== '00:00' && apiDuration !== '') {
    setDetectedDuration(null);
    return;
  }

  // Need a video URL to detect from
  if (!video.videoUrl) return;

  const hiddenVideo = document.createElement('video');
  hiddenVideo.preload = 'metadata';
  hiddenVideo.src = video.videoUrl;
  
  const handleMetadata = () => {
    const seconds = Math.floor(hiddenVideo.duration);
    if (seconds > 0) {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      
      if (hours > 0) {
        setDetectedDuration(`${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
      } else {
        setDetectedDuration(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    }
    hiddenVideo.remove();
  };

  hiddenVideo.addEventListener('loadedmetadata', handleMetadata);
  
  return () => {
    hiddenVideo.removeEventListener('loadedmetadata', handleMetadata);
    hiddenVideo.remove();
  };
}, [video.videoUrl, video.duration]);

// Compute display duration - prefer API, fallback to detected
const displayDuration = (video.duration && video.duration !== '0:00' && video.duration !== '00:00' && video.duration !== '') 
  ? video.duration 
  : detectedDuration;
```

### 2. Update Duration Badge Rendering

Change the duration badge to only render when we have a valid duration:

```typescript
{/* Duration badge - only show when valid duration exists */}
{!(isPlaying && duration > 0 && (showControls || isTouchDevice)) && displayDuration && (
  <div className="absolute bottom-2 right-2 bg-black/40 backdrop-blur-[24px] saturate-[180%] px-1.5 py-0.5 rounded border border-white/10 text-xs text-white font-medium">
    {displayDuration}
  </div>
)}
```

## Technical Details

| File | Changes |
|------|---------|
| `src/components/app/cards/VideoCard.tsx` | Add `detectedDuration` state, metadata detection effect, update badge conditional |

## How It Works

1. When `VideoCard` mounts, it checks if `video.duration` is valid
2. If not, it creates a hidden video element and sets `preload="metadata"`
3. When metadata loads, it extracts `hiddenVideo.duration` (in seconds)
4. It formats this to `MM:SS` or `HH:MM:SS` and stores in `detectedDuration`
5. The badge uses `displayDuration` which prefers API data but falls back to detected
6. If neither exists, the badge doesn't render at all

## Benefits

- Users always see accurate video durations
- Works for all videos, even those with missing API data
- Minimal performance impact (only loads metadata, not full video)
- Consistent with the fix already applied to MusicFeed
