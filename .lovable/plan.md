

## Problem Analysis

Two issues in the video feed:

1. **Mute doesn't carry forward**: When a user unmutes a video and scrolls, the next video's autoplay forces `muted = true` (hardcoded at line 544 of VideoCard.tsx), ignoring the `globalMuted` preference they just set.

2. **Fullscreen grid conflict**: In wide/collapsed-sidebar mode, two video cards can be visible simultaneously. The `VideoPlaybackManager.play()` method pauses the previous video, so only one ever plays — but both should play in a grid layout.

## Plan

### Step 1: Fix mute propagation in autoplay

In `VideoCard.tsx` line 544, replace the hardcoded `vid.muted = true; setIsMuted(true)` with a read from `videoPlaybackManager.globalMuted`. This way, if the user unmuted a previous video, the next autoplay video inherits that unmuted state.

### Step 2: Add multi-play support to VideoPlaybackManager

Upgrade the manager from tracking a single `currentlyPlaying` to a `Set` of currently playing IDs. Add a mode or method that allows multiple concurrent videos (for the grid/feed context) while still supporting single-play for contexts like TV player or dedicated video pages.

- Add `playInFeed(id)` — registers as playing without pausing others (used by autoplay in feed grid)
- Keep `play(id)` — exclusive single-play (used by manual click, TV player, etc.)
- `stop(id)` — removes from the active set

### Step 3: Update VideoCard autoplay observer to use `playInFeed`

In the IntersectionObserver callback (line 540-554), call `videoPlaybackManager.playInFeed(instanceId)` instead of `play(instanceId)` so grid-visible videos don't pause each other.

### Step 4: Keep manual play exclusive

When the user explicitly clicks play (`handlePlayClick`), continue using `videoPlaybackManager.play(instanceId)` so it pauses other feed videos — the user's intent is to focus on that one video.

### Technical Details

```text
VideoPlaybackManager changes:
─────────────────────────────
- currentlyPlaying: VideoInstance | null  →  activePlaying: Set<string>
+ playInFeed(id): adds to set, no pausing
+ play(id): pauses ALL others, adds to set  (exclusive)
+ stop(id): removes from set
+ stopAll(): clears set (for tab switches etc.)

VideoCard autoplay observer:
────────────────────────────
- vid.muted = true;
+ vid.muted = videoPlaybackManager.globalMuted;
- setIsMuted(true);
+ setIsMuted(videoPlaybackManager.globalMuted);
- videoPlaybackManager.play(instanceId);
+ videoPlaybackManager.playInFeed(instanceId);
```

