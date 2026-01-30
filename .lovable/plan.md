

# Fix: Profile Pictures in Comments - Root Cause Analysis

## Actual Problem Found
There are **two separate comment systems** in the codebase with different implementations:

| Component | Used By | Comment Type | Avatar Field |
|-----------|---------|--------------|--------------|
| `CommentsSection.tsx` (inline) | PostCard, VideoCard, ImageCard | Local `Comment` interface | `avatar` |
| `CommentsSheet.tsx` | LiveCard only | Shared `types.ts` | `avatarUrl` |

Previous fixes only updated:
- `CommentsSheet.tsx` ✅
- `CommentItem.tsx` (external) ✅

But **PostCard, VideoCard, and ImageCard** all use `CommentsSection.tsx`, which has its **own inline `CommentItem`** component that was never updated.

## Solution
The inline `CommentItem` in `CommentsSection.tsx` (lines 180-293) already correctly uses `comment.avatar`, and the `mapApiComment` function already maps to `avatar` field with `buildAvatarUrl`.

However, checking the actual API response shows `writor.avatarUrl` returns **full HTTPS URLs** like:
```
https://api.dehub.io/avatars/0x4c4b6ff85878a936992f45a9b108bde7e332b7e5.jpg
```

The `buildAvatarUrl` function already handles this correctly (returns as-is when URL starts with `http`).

**The real issue:** Need to verify the mapping is being applied correctly. Looking at line 106:
```typescript
avatar: address && rawAvatarPath ? buildAvatarUrl(address, rawAvatarPath) : undefined,
```

This could return `undefined` if either `address` or `rawAvatarPath` is falsy. But the API shows both are present.

### Debug Steps
1. Check if `CommentsSection.tsx` is actually passing the avatar URL to the inline `CommentItem`
2. Verify the `CommentItem` is rendering with the correct `avatarUrl`

### Files to Update

**`src/components/app/cards/CommentsSection.tsx`**
- The inline `CommentItem` at line 184 reads `comment.avatar` - verify this matches the mapped field
- The `mapApiComment` at line 106 sets `avatar` field - this looks correct

The code appears correct. Let me verify by checking if there's any type mismatch or if the avatar field is being set to the wrong type.

## Technical Details

### Current Flow in CommentsSection
```
API Response: writor.avatarUrl = "https://api.dehub.io/avatars/0x...jpg"
      ↓
mapApiComment():
  - address = "0x..."
  - rawAvatarPath = "https://api.dehub.io/avatars/0x...jpg" 
  - buildAvatarUrl() returns the URL as-is (starts with http)
  - avatar field set to full URL
      ↓
CommentItem receives comment.avatar = "https://api.dehub.io/avatars/..."
      ↓
<AvatarImage src={avatarUrl} /> should render correctly
```

### Verification Needed
The logic appears correct. To confirm the fix is working, I'll:
1. Add console logging to trace the avatar URL through the mapping
2. Check if there are edge cases where `writor` or `avatarUrl` is missing

### Proposed Changes
If avatars still aren't rendering, the issue might be:
1. The `avatar` field in the local `Comment` type is typed as `string` (not `string | undefined`), which could cause issues if undefined is assigned
2. A caching issue from stale query data

**Fix:** Update the inline `Comment` interface in `CommentsSection.tsx` to match reality:
```typescript
avatar: string;  // Change to: avatar?: string;
```

And ensure defensive handling in the `CommentItem` render.

