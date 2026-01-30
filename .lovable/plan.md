
# Plan: Non-Portrait Video Detection with Liquid Glass Borders

## Overview
Enhance the ShortsViewer to detect landscape or square videos and display them at their correct aspect ratio, with liquid glass styling filling the empty space above and below the video.

## How It Will Work
When you open a Short that isn't filmed in portrait orientation (9:16), the viewer will:
1. Detect the video's actual dimensions when it loads
2. Display the video at its correct aspect ratio (instead of stretching/cropping)
3. Fill the top and bottom gaps with a stylish frosted glass effect that matches the app's design

## Technical Implementation

### 1. Add Video Dimension State
Track the video's natural width/height in the ShortsViewer component:
```tsx
const [videoAspect, setVideoAspect] = useState<'portrait' | 'landscape' | 'square'>('portrait');
const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
```

### 2. Detect Aspect Ratio on Load
Use the video element's `onLoadedMetadata` event to capture dimensions:
```tsx
const handleLoadedMetadata = () => {
  if (videoRef.current) {
    const { videoWidth, videoHeight } = videoRef.current;
    setVideoDimensions({ width: videoWidth, height: videoHeight });
    
    const ratio = videoWidth / videoHeight;
    if (ratio > 1.1) {
      setVideoAspect('landscape'); // Wider than tall
    } else if (ratio < 0.9) {
      setVideoAspect('portrait');  // Taller than wide (normal shorts)
    } else {
      setVideoAspect('square');    // Roughly square
    }
  }
};
```

### 3. Update Video Styling
Change from `object-cover` (crop to fill) to `object-contain` (fit within container) for non-portrait videos:
```tsx
<video
  className={`w-full h-full ${videoAspect === 'portrait' ? 'object-cover' : 'object-contain'}`}
  // ... other props
/>
```

### 4. Add Liquid Glass Background Layers
Add frosted glass panels behind the video for non-portrait content:
```tsx
{videoAspect !== 'portrait' && (
  <>
    {/* Blurred thumbnail background */}
    <div 
      className="absolute inset-0 z-0"
      style={{
        backgroundImage: `url(${currentShort.thumbnail})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(40px) saturate(150%)',
        transform: 'scale(1.1)', // Prevent blur edge artifacts
      }}
    />
    {/* Liquid glass overlay */}
    <div className="absolute inset-0 z-[1] bg-black/40 backdrop-blur-[24px] saturate-[180%]" />
  </>
)}
```

### 5. Reset State on Video Change
Clear the aspect ratio state when navigating between shorts to prevent flicker:
```tsx
useEffect(() => {
  setVideoAspect('portrait'); // Reset to default
  setVideoDimensions({ width: 0, height: 0 });
  // ... existing video reset logic
}, [currentIndex]);
```

## Files to Modify
- `src/components/app/cards/ShortsViewer.tsx` - Add dimension detection and liquid glass styling

## Visual Result
- **Portrait videos (9:16)**: No change - displayed full-screen as before
- **Landscape videos (16:9)**: Centered vertically with liquid glass bands top and bottom
- **Square videos (1:1)**: Centered with smaller liquid glass bands top and bottom

The liquid glass effect will use a blurred version of the video thumbnail as the base layer, creating a visually cohesive look that doesn't feel like empty space.
