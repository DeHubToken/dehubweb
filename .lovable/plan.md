
# Fix: Profile Pictures Not Rendering in Comments

## Problem
Profile pictures (PFPs) in the comments section are showing fallback initials (e.g., "E") instead of the actual avatar images.

## Root Cause
The comments system is using `getMediaUrl()` to convert avatar paths to CDN URLs. However, the DeHub API can return avatar paths in various formats like:
- `"avatars/xxx.jpg"`  
- `"statics/avatars/xxx.octet-stream"`

The `getMediaUrl()` function simply prepends the CDN base URL to these paths, which doesn't work correctly for all avatar path formats.

The rest of the codebase uses `buildAvatarUrl(address, apiAvatarPath)` which constructs canonical URLs in the format:
```
https://dehubcdn.../avatars/{address}.{ext}
```

This requires the user's wallet address (which IS available in the API response's `address` field) to build the correct URL.

## Solution
Update the comments system to use `buildAvatarUrl()` instead of `getMediaUrl()` for avatar URLs.

### Files to Update

**1. `src/components/app/comments/CommentsSheet.tsx`**
- Import `buildAvatarUrl` from `@/lib/media-url`
- Update `mapApiComment()` to use `buildAvatarUrl(apiComment.address, apiComment.writor?.avatarUrl)`

**2. `src/components/app/comments/CommentItem.tsx`**
- Import `buildAvatarUrl` from `@/lib/media-url`
- Update avatar URL resolution to use `buildAvatarUrl(comment.address, comment.avatarUrl)`
- Requires the `Comment` type to include the `address` field

**3. `src/components/app/cards/CommentsSection.tsx`**
- Import `buildAvatarUrl` from `@/lib/media-url`
- Update `mapApiComment()` to build avatar URL using `buildAvatarUrl(apiComment.address, apiComment.writor?.avatarUrl)`
- Store the resolved URL directly in the mapped comment

**4. `src/components/app/comments/CommentInput.tsx`**
- Import `buildAvatarUrl` from `@/lib/media-url`
- Update the logged-in user's avatar to use `buildAvatarUrl(user.address, user.avatarImageUrl || user.avatarUrl)`

---

## Technical Details

### Current (Broken) Flow
```
API Response: { address: "0x123...", writor: { avatarUrl: "statics/avatars/xyz.octet-stream" } }
      ↓
getMediaUrl() → "https://dehubcdn.../statics/avatars/xyz.octet-stream"
      ↓
❌ Image fails to load (incorrect URL format)
```

### Fixed Flow
```
API Response: { address: "0x123...", writor: { avatarUrl: "statics/avatars/xyz.octet-stream" } }
      ↓
buildAvatarUrl("0x123...", "statics/avatars/xyz.octet-stream")
      ↓  
"https://dehubcdn.../avatars/0x123....octet-stream"
      ↓
✅ Image loads correctly
```

### Code Changes Summary

| File | Change |
|------|--------|
| `CommentsSheet.tsx` | Use `buildAvatarUrl` in `mapApiComment` |
| `CommentItem.tsx` | Use `buildAvatarUrl` with comment's address |
| `CommentsSection.tsx` | Use `buildAvatarUrl` in `mapApiComment` |
| `CommentInput.tsx` | Use `buildAvatarUrl` for current user's avatar |

