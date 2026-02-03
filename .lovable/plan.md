
# Fix Camera Modal Button Delay

## Problem
The post modal's camera buttons have a delay before becoming clickable, while the story recorder's buttons are instant. This is because of different approaches to when buttons are enabled.

## Solution
Match the story recorder's approach - enable buttons immediately after getting the camera stream, rather than waiting for the video to be playable.

## Changes

### `src/features/post/components/CameraCaptureModal.tsx`
- Remove the `oncanplay` event handler that delays button activation
- Move `setIsInitializing(false)` to a `finally` block so it runs immediately after `getUserMedia` succeeds
- This matches the behavior in `StoryRecorderModal.tsx`

```typescript
// Before (delayed):
if (videoRef.current) {
  videoRef.current.srcObject = stream;
  videoRef.current.oncanplay = () => {
    setIsInitializing(false);
  };
}

// After (instant):
if (videoRef.current) {
  videoRef.current.srcObject = stream;
}
// ... in finally block:
setIsInitializing(false);
```

## Technical Details
- The `oncanplay` event only fires after the browser has buffered enough video data
- For a live camera stream, this adds unnecessary delay since the stream is already active
- Setting `isInitializing` to `false` immediately after getting the stream is safe because the stream is already available for capture/recording
