
## Fix Live Card Thumbnails for Ended Streams

### What's Happening

When a live stream ends without the creator having uploaded a custom thumbnail, the `rawThumbnail` field from the API is null/empty. The code then falls through to a generic Unsplash fallback image — which is what's showing as "broken" for Shubham's streams.

These aren't broken URLs — the streams have simply ended and were never given a custom thumbnail.

### The Fix

Livepeer automatically captures a "last frame" thumbnail for every stream via a well-known URL pattern:

```
https://livepeercdn.studio/hls/{playbackId}/thumbnail.jpg
```

Since `playbackId` is already being stored and used for HLS playback URLs in `mapApiLiveStreamToLocal`, we can use it as the primary fallback for the thumbnail — showing the actual last frame of the stream.

The card will also show a "Stream Ended" overlay on top of the thumbnail when `stream.isLive === false`, so users understand they can't replay it.

---

### Change 1 — `src/hooks/use-dehub-feed.ts` (thumbnail resolution)

In `mapApiLiveStreamToLocal` (~line 449), update the thumbnail resolution priority:

```
Priority order:
1. rawThumbnail (if the creator uploaded one — strip any leading slash)  
2. Livepeer last-frame: https://livepeercdn.studio/hls/{playbackId}/thumbnail.jpg
3. Generic Unsplash fallback (last resort, when no playbackId either)
```

```typescript
const playbackId = (stream as any).playbackId;
const livepeerThumb = playbackId
  ? `https://livepeercdn.studio/hls/${playbackId}/thumbnail.jpg`
  : null;

const thumbnail = rawThumbnail
  ? (rawThumbnail.startsWith('http') ? rawThumbnail : `${DEHUB_CDN_BASE}${rawThumbnail.replace(/^\//, '')}`)
  : livepeerThumb ?? FALLBACK_THUMBNAILS[index % FALLBACK_THUMBNAILS.length];
```

This also fixes the double-slash bug (`.replace(/^\//, '')`) that was identified earlier.

---

### Change 2 — `src/components/app/cards/LiveCard.tsx` (UI overlay + error fallback)

In the thumbnail `<div>` block (~line 123–126):

- Add an `onError` handler so if the Livepeer thumbnail 404s (very old/deleted stream), it gracefully falls back to the generic image
- When `stream.isLive === false`, render a dark overlay with a "Stream Ended" badge over the thumbnail

```tsx
{/* Thumbnail */}
<div className="relative aspect-video bg-zinc-800 rounded-lg overflow-hidden" data-no-navigate>
  <img
    src={stream.thumbnail}
    alt=""
    className="w-full h-full object-cover"
    onError={(e) => {
      (e.currentTarget as HTMLImageElement).src =
        'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=480&h=270&fit=crop';
    }}
  />
  {!stream.isLive && (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
      <span className="text-white text-xs font-semibold bg-zinc-800/80 px-3 py-1 rounded-full backdrop-blur-sm">
        Stream Ended
      </span>
    </div>
  )}
</div>
```

---

### Files to Change

- `src/hooks/use-dehub-feed.ts` — update thumbnail resolution in `mapApiLiveStreamToLocal` to use Livepeer last-frame URL as middle fallback, and fix the leading-slash bug
- `src/components/app/cards/LiveCard.tsx` — add "Stream Ended" overlay and `onError` fallback on the thumbnail image
