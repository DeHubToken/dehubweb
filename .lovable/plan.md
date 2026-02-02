
# Video Thumbnail Selector Improvements

## Summary
Redesign the video thumbnail selector to match video dimensions, add frame selection from 20 video frames, update text labels from "Cover" to "Thumbnail", and remove the "Auto" badge.

## Changes Overview

### 1. Match Thumbnail Dimensions to Video
The thumbnail preview container will be changed from `aspect-[9/16]` (portrait) to `aspect-video` (16:9) with the same responsive widths as the video preview.

**Current dimensions:**
- Thumbnail: `w-[100px] sm:w-[120px] md:w-[140px] aspect-[9/16]`

**New dimensions:**
- Thumbnail: `aspect-video w-[280px] sm:w-[320px] md:w-[380px]`

Since both will now be the same size, they'll stack vertically instead of side-by-side.

### 2. Frame Selection UI (20 Frames)
Add a horizontal scrollable strip showing 20 extracted frames from the video:
- When a video is added, extract 20 evenly-spaced frames using canvas
- Display these as small clickable thumbnails below the main thumbnail preview
- Clicking a frame sets it as the thumbnail
- Keep the upload button to allow custom upload as an alternative

**Technical approach:**
- Create a helper function `extractVideoFrames(videoUrl: string, frameCount: number)` that returns an array of blob URLs
- Use canvas `drawImage()` and `toBlob()` to capture frames at evenly distributed time points
- Store extracted frames in component state, generate them when video is loaded
- Add `onSelectFrame?: (index: number, frameUrl: string) => void` callback

### 3. Text Label Changes
- Change "Add Cover" → "Add Thumbnail" (line 697)
- Change bottom label "Cover" → "Thumbnail" (line 702)

### 4. Remove Auto Badge
Remove the auto-generated badge section entirely (lines 679-684).

---

## Technical Implementation

### File: `src/features/post/components/PostMediaPreview.tsx`

#### A. Add Frame Extraction State & Helper
```typescript
// New state for extracted frames per video
const [videoFrames, setVideoFrames] = useState<Map<number, string[]>>(new Map());

// Helper function to extract frames from video
const extractVideoFrames = useCallback(async (videoUrl: string, index: number) => {
  const video = document.createElement('video');
  video.src = videoUrl;
  video.crossOrigin = 'anonymous';
  
  await new Promise(resolve => {
    video.onloadedmetadata = resolve;
  });
  
  const duration = video.duration;
  const frameCount = 20;
  const frames: string[] = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = 160; // Small thumbnail width
  canvas.height = 90; // 16:9 aspect ratio
  
  for (let i = 0; i < frameCount; i++) {
    const time = (duration / (frameCount + 1)) * (i + 1);
    video.currentTime = time;
    await new Promise(resolve => { video.onseeked = resolve; });
    
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => 
      canvas.toBlob(resolve, 'image/jpeg', 0.7)
    );
    if (blob) frames.push(URL.createObjectURL(blob));
  }
  
  setVideoFrames(prev => new Map(prev).set(index, frames));
}, []);
```

#### B. Trigger Frame Extraction When Video Added
```typescript
useEffect(() => {
  media.forEach((m, index) => {
    if (m.type === 'video' && !videoFrames.has(index)) {
      extractVideoFrames(m.preview, index);
    }
  });
}, [media, extractVideoFrames, videoFrames]);
```

#### C. Update Thumbnail Container Layout
Change from side-by-side to stacked layout with same dimensions as video:

```tsx
{/* ==================== VIDEO + THUMBNAIL STACKED ==================== */}
<div className="flex flex-col gap-2">
  {/* Video preview container - unchanged */}
  <div className="relative aspect-video w-[280px] sm:w-[320px] md:w-[380px] ...">
    ...
  </div>
  
  {/* Thumbnail preview - same dimensions as video */}
  <div className="relative aspect-video w-[280px] sm:w-[320px] md:w-[380px] rounded-2xl overflow-hidden bg-zinc-900 border-2 border-dashed border-white/20">
    {m.thumbnail ? (
      <>
        <img src={m.thumbnail} className="w-full h-full object-cover" />
        {/* Overlay + remove button - NO Auto badge */}
      </>
    ) : (
      <div className="...">
        <Upload className="w-6 h-6" />
        <span>Add Thumbnail</span>  {/* Changed from "Add Cover" */}
      </div>
    )}
    <div className="...">
      <span>Thumbnail</span>  {/* Changed from "Cover" */}
    </div>
  </div>
  
  {/* Frame Selection Strip */}
  <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
    {/* Upload button */}
    <button 
      onClick={() => triggerThumbnailUpload(index)}
      className="flex-shrink-0 w-16 h-9 rounded-lg bg-zinc-800 border border-white/20 flex items-center justify-center"
    >
      <Upload className="w-4 h-4 text-white/60" />
    </button>
    
    {/* Frame thumbnails */}
    {videoFrames.get(index)?.map((frameUrl, frameIndex) => (
      <button
        key={frameIndex}
        onClick={() => onAddThumbnail?.(index, frameUrl)}
        className="flex-shrink-0 w-16 h-9 rounded-lg overflow-hidden border-2 border-transparent hover:border-white/50"
      >
        <img src={frameUrl} className="w-full h-full object-cover" />
      </button>
    ))}
  </div>
</div>
```

---

## Files Modified
- `src/features/post/components/PostMediaPreview.tsx`
  - Add frame extraction logic
  - Update thumbnail container dimensions
  - Add frame selection strip UI
  - Change "Cover" → "Thumbnail" text
  - Remove "Auto" badge

## Visual Result
```text
┌──────────────────────────────┐
│                              │
│       VIDEO PREVIEW          │
│       (16:9 aspect)          │
│                              │
└──────────────────────────────┘
┌──────────────────────────────┐
│                              │
│    THUMBNAIL PREVIEW         │
│    (16:9 aspect - same size) │
│                              │
└──────────────────────────────┘
┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐...
│📤││F1││F2││F3││F4││F5│ (scrollable)
└──┘└──┘└──┘└──┘└──┘└──┘
 ↑   ↑
 │   20 video frames to choose from
 Upload custom
```
