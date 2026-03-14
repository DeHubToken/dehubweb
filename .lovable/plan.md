

# PiP Not Working in SafePal Browser

## Root Cause

The floating PiP player has two issues that break in SafePal's restrictive WebView:

1. **Autoplay blocked**: The player starts with `isMuted: false` (line 29). SafePal blocks unmuted autoplay. When `video.play()` rejects, the error is silently caught (`.catch(() => {})`), and the player appears broken — no video plays.

2. **Web Workers may be restricted**: HLS.js is configured with `enableWorker: true`. Some WebViews restrict or block Web Workers, causing HLS initialization to fail silently.

## Fix

**`src/components/app/tv/FloatingPiPPlayer.tsx`**:

1. Change the autoplay strategy: start the video **muted**, play it, then unmute after playback starts. If unmuted play fails, keep it muted but playing (user can manually unmute).

2. Add Web Worker fallback: wrap HLS init with `enableWorker: false` retry if the first attempt fails.

```typescript
// Play strategy: start muted to satisfy autoplay policy, then unmute
hls.on(Hls.Events.MANIFEST_PARSED, () => {
  video.muted = true;
  video.play().then(() => {
    // Playback started — now try unmuting
    video.muted = false;
    video.play().catch(() => {
      // Unmuted play blocked — stay muted, user can toggle
      video.muted = true;
      setIsMuted(true);
    });
  }).catch(() => {
    // Even muted play failed — nothing we can do
  });
});
```

3. For HLS init, catch worker errors and retry without workers:
```typescript
hls.on(Hls.Events.ERROR, (_event, data) => {
  if (data.fatal) {
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      hls.startLoad();
    } else {
      // Retry without worker before giving up
      if (hls.config.enableWorker) {
        hls.destroy();
        const fallbackHls = new Hls({ enableWorker: false, ... });
        // re-init...
      } else {
        onClose(channel.id);
      }
    }
  }
});
```

Same muted-first play strategy for the native HLS fallback path (Safari/iOS).

