

## Fix: Hide video controls by default, show only on interaction

**Problem**: On mobile (`isTouchDevice`), video controls (speed, loop, PiP, fullscreen, progress bar) are always visible while a video is playing. They should be hidden by default and only appear when the user taps the video.

**Root cause**: Line 1440 in `VideoCard.tsx` uses `(isPlaying || showControls) && (showControls || isTouchDevice)` — the `isTouchDevice` flag bypasses the `showControls` state, making controls permanently visible on touch devices.

### Changes (1 file)

**`src/components/app/cards/VideoCard.tsx`**

1. **Top controls condition** (line 1440): Change from `(isPlaying || showControls) && (showControls || isTouchDevice)` to simply `showControls`. Controls only render when the user has interacted (hover on desktop, tap on mobile).

2. **Progress bar condition** (line 1491): Same fix — change `(showControls || isTouchDevice)` to just `showControls`.

3. **Duration badge condition** (line 1553): Update the inverse condition accordingly — show duration badge when controls are hidden.

4. **Add tap-to-toggle on mobile**: Ensure the existing `onClick` / touch handler on the video container calls `showControlsBriefly()` so tapping on mobile reveals controls for 2 seconds, matching the desktop hover behavior.

This keeps the existing 2-second auto-hide timer and hover logic intact — just removes the permanent-on behavior for touch devices.

