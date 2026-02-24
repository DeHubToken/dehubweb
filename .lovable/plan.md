

## Corrected Analysis: "No video file or thumbnail" Error

### What's Actually Happening

The error **"no video file or thumbnail"** is a server-side validation error from the DeHub `/api/user_mint` endpoint. It means the API received the request but the video file and/or thumbnail were missing or unreadable in the `FormData`.

### Root Cause: Race Condition in Thumbnail Generation

The video processing flow has a **race condition**:

1. **Line 218-222**: When a video is selected, the media entry is created immediately with just `{ file, preview, type: 'video' }` — **no thumbnail yet**
2. **Lines 224-282**: Thumbnail generation runs **in the background** (async) — it creates a `<video>` element, seeks to a frame, draws to canvas, and converts to blob
3. **Lines 774-782**: When the user hits Post, the code checks `media[0].thumbnailBlob` or `media[0].thumbnail`

**If the user posts before thumbnail generation completes**, `thumbnailBlob` is `undefined` and `thumbnail` URL doesn't exist. The `mintPost()` call then sends FormData with the video file but **no thumbnail blob**.

Additionally, thumbnail generation can **silently fail** (line 269-271 catches and only warns) — for example if `canvas.width` or `canvas.height` is 0 (video dimensions not yet available), or `canvas.toBlob` returns null. In that case, `thumbnailBlob` is never set, and the post will always fail.

The DeHub API likely **requires** a thumbnail for video posts, hence the error.

### Why It's Intermittent

- Fast devices: thumbnail generates before user finishes typing → works
- Slow devices / large videos: thumbnail generation lags → user posts before it's ready → fails
- Some video codecs: canvas draw fails silently → thumbnail never generated → always fails

### Proposed Fix

**File: `src/features/post/hooks/usePostForm.ts`**

1. **Add a `thumbnailReady` state** (or a flag on the media item) that tracks whether thumbnail generation has completed
2. **Block posting until thumbnail is ready** for video posts — if `hasVideo && !media[0].thumbnailBlob`, either:
   - Wait for thumbnail generation to complete (show "Generating thumbnail..." toast)
   - Or generate one on-the-fly before calling `mintPost()`
3. **Add fallback thumbnail generation** in the `handlePost` function: if `thumbnailBlob` is still missing when posting, attempt to generate one synchronously before submitting
4. **Surface the thumbnail failure**: Instead of silently warning at line 270, set an error state so the user knows their video may have an issue

### Changes

**`src/features/post/hooks/usePostForm.ts`**:
- Add `isGeneratingThumbnail` state, set `true` when video processing starts, `false` when complete (success or failure)
- In `handlePost` (~line 774): if `hasVideo` and no `thumbnailBlob`, attempt a last-resort thumbnail generation before calling `mintPost`. If that also fails, show a clear error: "Could not generate thumbnail. Please try a different video or add a custom thumbnail."
- Update `canPost` computed value to be `false` while `isGeneratingThumbnail` is true, preventing premature submission
- In the thumbnail generation catch block (line 269), log the error more visibly and ensure the user can still manually add a thumbnail via the existing UI

This is a ~20 line change concentrated in the video processing and post submission sections of `usePostForm.ts`.

