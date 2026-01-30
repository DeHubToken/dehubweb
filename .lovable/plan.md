

# Fix: Profile Pictures in Comments

## Root Cause Found

The API returns avatar URLs from `https://api.dehub.io/avatars/...` but the actual images are served from the CDN at `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/avatars/...`.

The current `buildAvatarUrl` function bypasses CDN conversion when it sees a full HTTP URL - which is correct for most cases, but incorrect when the API returns the wrong domain.

## Solution

Update `buildAvatarUrl` in `src/lib/media-url.ts` to detect `api.dehub.io` avatar URLs and convert them to CDN URLs.

---

### File Changes

**`src/lib/media-url.ts`**

Update `buildAvatarUrl` to handle `api.dehub.io` URLs:

```typescript
export function buildAvatarUrl(address: string, apiAvatarPath: string | undefined | null): string | undefined {
  if (!apiAvatarPath) return undefined;
  
  // If it's already a dehubcdn URL, return as-is
  if (apiAvatarPath.startsWith('https://dehubcdn')) return apiAvatarPath;
  
  // If it's an api.dehub.io avatar URL, extract extension and rebuild with CDN
  if (apiAvatarPath.includes('api.dehub.io/avatars/')) {
    const ext = getExtension(apiAvatarPath);
    return `${DEHUB_CDN_BASE}avatars/${address}.${ext}`;
  }
  
  // Other full URLs (dicebear, etc.) - return as-is
  if (apiAvatarPath.startsWith('http')) return apiAvatarPath;
  
  // Relative path - build CDN URL
  const ext = getExtension(apiAvatarPath);
  return `${DEHUB_CDN_BASE}avatars/${address}.${ext}`;
}
```

---

### Why This Works

| API Returns | Current Behavior | Fixed Behavior |
|-------------|------------------|----------------|
| `https://api.dehub.io/avatars/0x123.jpg` | Returns as-is (broken) | Converts to `https://dehubcdn.../avatars/0x123.jpg` |
| `https://dehubcdn.../avatars/0x123.jpg` | Returns as-is (works) | Returns as-is (works) |
| `avatars/0x123.jpg` | Builds CDN URL (works) | Builds CDN URL (works) |
| `statics/avatars/xxx.octet-stream` | Builds CDN URL (works) | Builds CDN URL (works) |

---

### Technical Details

The fix is minimal and surgical - only changing the `buildAvatarUrl` function in one file. This will automatically fix:
- `CommentsSection.tsx` (PostCard, VideoCard, ImageCard comments)
- `CommentsSheet.tsx` (LiveCard comments)  
- `CommentItem.tsx` (external component)
- All other places using `buildAvatarUrl`

