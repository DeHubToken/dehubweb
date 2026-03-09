

## Make Video Download Button Functional

### Problem
The download buttons in `VideoCard.tsx` (both desktop dropdown and mobile drawer) are inert — no `onClick` handler.

### Approach
Add an `onClick` handler that fetches the video as a blob and triggers a browser download using a temporary anchor element. This avoids CORS issues that `<a download>` has with cross-origin URLs.

### Changes — `src/components/app/cards/VideoCard.tsx`

**1. Add download handler function** (near other callbacks):
```typescript
const handleDownloadVideo = useCallback(async () => {
  if (!video.videoUrl) return;
  toast.loading('Preparing download...', { id: 'video-download' });
  try {
    const response = await fetch(video.videoUrl);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${video.title || video.id || 'video'}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Download started', { id: 'video-download' });
  } catch {
    toast.error('Download failed', { id: 'video-download' });
  }
}, [video.videoUrl, video.title, video.id]);
```

**2. Wire both download buttons** (lines ~1027 and ~1553):
Add `onClick={handleDownloadVideo}` to both `<button>` elements that currently have no handler.

