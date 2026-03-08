

## Problem

The sidebar avatar reads `user.avatarImageUrl` from AuthContext and passes it through `buildAvatarUrl()`. When `patchUser` sets `avatarImageUrl` to a blob URL (e.g. `blob:https://...`), `buildAvatarUrl` doesn't recognize it — blob URLs start with `blob:`, not `http` — so it gets mangled into a CDN path, and the preview is lost.

## Fix

**`src/lib/media-url.ts`** — In `buildAvatarUrl`, add an early return for blob URLs and data URLs before any path processing:

```typescript
// Blob or data URLs (optimistic previews) - return as-is
if (apiAvatarPath.startsWith('blob:') || apiAvatarPath.startsWith('data:')) {
  return apiAvatarPath;
}
```

Add this right after the initial null/empty checks (after line 39), before any CDN/path logic runs.

Similarly in `buildCoverUrl`, add the same check before line 78's `startsWith('http')` check.

## Why This Works

When `patchUser({ avatarImageUrl: blobUrl })` is called after a profile save, the sidebar's `buildAvatarUrl(user.address, user.avatarImageUrl)` will now pass the blob URL through unchanged, displaying the new image instantly. Once the CDN propagates and the next `refreshUser` runs, the real CDN path will replace it naturally.

