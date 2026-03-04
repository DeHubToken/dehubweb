

## Problem

The upload progress bar tracks **XHR bytes sent** (`xhr.upload.onprogress`), which reaches 95-100% as soon as the video file finishes transferring to the server. But the server then spends significant time **processing** the video (encoding, thumbnail generation, etc.) before responding. So the bar sits at 100% while the user waits, making it look broken.

Meanwhile, the **toasts already accurately reflect each stage**: "Uploading content" → "Publishing to decentralized database" → "Posted successfully".

## Plan

**Remove the progress bar entirely** and keep the existing toast-based status flow, which already works correctly.

### Changes

**`src/features/post/hooks/usePostForm.ts`**
- Remove `uploadProgress` state variable
- Remove the `(percent) => setUploadProgress(percent)` callback from `mintPost` call
- Remove `setUploadProgress(0)` resets
- Remove `uploadProgress` from returned state

**`src/features/post/types.ts`**
- Remove `uploadProgress` from `PostFormState` interface

**`src/features/post/components/PostActionBar.tsx`**
- Remove `uploadProgress` prop and the entire progress bar UI block (the `showUploadBar` section, lines ~184-212)

**`src/features/post/PostModal.tsx`**
- Remove `uploadProgress` prop pass-through

**`src/lib/api/dehub/content.ts`**
- Remove `onProgress` parameter from `mintPost` function signature and the `xhr.upload.onprogress` handler (clean up unused code)

No new dependencies. The toasts already handle all user feedback accurately.

