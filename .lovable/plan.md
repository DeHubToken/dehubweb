

## Fix: Video Controls Not Appearing After Clicking Play

### Root Cause

The video controls (volume, PiP, fullscreen, progress bar) are gated behind a `showControls` state that is driven purely by `onMouseEnter` / `onMouseLeave` on the container div. When the user clicks the play button:

1. `isPlaying` becomes `true`
2. The play button overlay div (which the cursor was hovering on) is removed from the DOM
3. The browser fires a `mouseleave` event on the container because the element under the cursor vanished
4. `showControls` flips to `false`
5. The top controls and progress bar never render because they require `showControls === true`
6. The user has to move the mouse out and back in to re-trigger `onMouseEnter`

### Solution

Introduce a timed "controls visible" mechanism that keeps controls showing for a few seconds after any user interaction (play, pause, click), independent of hover state. This guarantees controls are always visible after clicking play.

### Changes to `src/components/app/cards/VideoCard.tsx`

**1. Add a `controlsTimerRef` and replace simple hover-based logic**

- Add a `useRef` for the auto-hide timer
- Create a `showControlsBriefly()` helper that:
  - Sets `showControls` to `true`
  - Clears any existing timer
  - Sets a new 3-second timer to hide controls (only if mouse is not hovering)
- Track mouse hover state separately via a `isHovering` ref (not state, to avoid re-renders)

**2. Call `showControlsBriefly()` on play/pause actions**

- In `handlePlayClick`: after starting playback, call `showControlsBriefly()` so controls appear immediately
- In `handleVideoAreaClick` / `handleTouchEnd`: also call it so any tap/click reveals controls

**3. Update `onMouseEnter` / `onMouseLeave`**

- `onMouseEnter`: set `isHovering` ref to `true`, set `showControls(true)`, clear any auto-hide timer
- `onMouseLeave`: set `isHovering` ref to `false`, start the 3-second auto-hide timer

**4. Cleanup timer on unmount**

- Clear the timer in the component's cleanup to avoid memory leaks

### Behavior After Fix

```text
User clicks play
    |
    v
Video starts, showControls = true (forced)
    |
    v
Controls visible for 3 seconds
    |
    +--> Mouse still hovering? --> Controls stay visible
    |
    +--> Mouse left? --> Controls auto-hide after 3s
```

On touch devices, nothing changes -- they already use `isTouchDevice` to keep controls always visible during playback.

### Technical Details

```text
// New refs
controlsTimerRef = useRef<NodeJS.Timeout>()
isHoveringRef = useRef(false)

// New helper
showControlsBriefly():
  setShowControls(true)
  clearTimeout(controlsTimerRef.current)
  controlsTimerRef.current = setTimeout(() => {
    if (!isHoveringRef.current) setShowControls(false)
  }, 3000)

// Updated handlers
onMouseEnter:
  isHoveringRef.current = true
  setShowControls(true)
  clearTimeout(controlsTimerRef.current)

onMouseLeave:
  isHoveringRef.current = false
  controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000)

handlePlayClick (play branch):
  ...existing play logic...
  showControlsBriefly()

handleVideoAreaClick (single click branch):
  ...existing logic calls handlePlayClick which now calls showControlsBriefly...
```

### File Changed

| File | Action |
|------|--------|
| `src/components/app/cards/VideoCard.tsx` | Modify -- add timed controls visibility logic |

Only one file needs to change. No new files, no database changes, no dependencies.
