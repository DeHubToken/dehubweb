

# Fix: Pausing TV Stream Shows "Stream Unavailable" Error

## Root Cause

When a user pauses a TV channel, the `stopPlayback()` function sets `videoRef.current.src = ''` to clear the video source. This triggers the browser's native video `error` event, which the error handler interprets as a stream failure and displays "Stream unavailable."

## The Fix

Add a guard flag (`isStoppingRef`) that the `stopPlayback` function sets **before** clearing the video source. The video `error` event handler will check this flag and skip setting the error state if the stop was intentional.

## Changes

### File: `src/components/app/tv/TVChannelCard.tsx`

1. Add a new ref to track intentional stops:
   - `const isStoppingRef = useRef(false);`

2. Update `stopPlayback` to set the flag before clearing:
   - Set `isStoppingRef.current = true` at the start
   - After clearing the source, reset `isStoppingRef.current = false`

3. Update the `handleError` video event listener:
   - Add an early return if `isStoppingRef.current` is `true`, so intentional stops don't trigger the error state

## Technical Detail

```text
Current flow (buggy):
  Click Pause --> stopPlayback() --> video.src = '' --> browser fires 'error' event --> hasError = true --> "Stream unavailable"

Fixed flow:
  Click Pause --> stopPlayback() --> isStoppingRef = true --> video.src = '' --> browser fires 'error' event --> isStoppingRef is true, skip --> no error shown
```

This is a minimal, targeted fix — one new ref and two small guard checks. No changes to the UI, layout, or other playback logic.

