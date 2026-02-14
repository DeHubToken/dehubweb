

## Fix: Notification Avatars Not Refreshing for Aggregated Entries

### Problem
Aggregated notifications (e.g., "okanbey started following you" with "okanbey, usa, outforrder") show a stale or default avatar for the primary actor. Two root causes:

1. **No cache-busting on CDN avatar URLs** -- `buildAvatarUrl` produces a static URL like `dehubcdn.../avatars/0xabc.jpg`. When a user updates their profile picture, the filename stays the same, so the browser serves a cached version of the old (or default) image indefinitely.

2. **Batch-avatars may return a full URL that gets double-processed** -- If the `batch-avatars` edge function returns a full `https://dehubcdn...` URL, `buildAvatarUrl` returns it as-is (correct). But if it returns a relative path, the function rebuilds it using the actor's address, which may produce a URL the CDN doesn't recognize for that user.

### Solution

#### 1. Add cache-busting timestamp to avatar URLs
Append a time-based query parameter to CDN avatar URLs so browsers always fetch the latest version. Use a coarse timestamp (rounded to every 5 minutes) to still benefit from short-term caching.

**File:** `src/lib/media-url.ts`
- In `buildAvatarUrl`, append `?v={timestamp}` to the final CDN URL where the timestamp is rounded to the nearest 5-minute window.

#### 2. Prefer enriched full URL directly when available
When `batch-avatars` returns a complete avatar URL (starting with `https://`), use it directly instead of re-processing through `buildAvatarUrl`.

**File:** `src/pages/app/NotificationsPage.tsx`
- In `NotificationItem`, if the enriched avatar URL is already a full URL, use it directly with cache-busting instead of passing it through `buildAvatarUrl`.

### Technical Details

**media-url.ts change:**
```typescript
export function buildAvatarUrl(address: string, apiAvatarPath: string | undefined | null): string | undefined {
  // ... existing logic ...
  // Before returning any CDN URL, append cache-bust param
  const cacheBust = Math.floor(Date.now() / 300000); // 5-min windows
  return `${cdnUrl}?v=${cacheBust}`;
}
```

**NotificationsPage.tsx change:**
```typescript
// If enriched avatar is a full URL, use it directly with cache-busting
const cacheBust = Math.floor(Date.now() / 300000);
const freshAvatar = enriched?.avatarUrl;
const avatarUrl = freshAvatar?.startsWith('http')
  ? `${freshAvatar}${freshAvatar.includes('?') ? '&' : '?'}v=${cacheBust}`
  : notification.actorAddress
    ? buildAvatarUrl(notification.actorAddress, freshAvatar || staleAvatarPath)
    : staleAvatarPath?.startsWith('http') ? staleAvatarPath : undefined;
```

### Build Error Fix
The existing build errors (`Property 'ethereum' does not exist on type 'Window'`) are unrelated to this change but will be fixed by adding a `Window` interface extension in a global type declaration file.

**New file:** `src/types/global.d.ts`
```typescript
interface Window {
  ethereum?: any;
}
```
