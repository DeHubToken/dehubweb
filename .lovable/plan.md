
# Fix Profile Pictures Not Rendering in Comment Sections

## Problem Identified

After analyzing the code, I found the issue in `CommentsSection.tsx`. The avatar URLs from the DeHub API are **relative paths** (like `avatars/xxx.jpg`), but they're being used directly in the `<AvatarImage src={comment.avatar}>` without converting them to full CDN URLs.

The `CommentsSheet.tsx` component handles this correctly by calling `getMediaUrl(comment.avatarUrl)`, but `CommentsSection.tsx` does not.

## Root Cause

In `src/components/app/cards/CommentsSection.tsx`:
- Line 191: `<AvatarImage src={comment.avatar} className="object-cover" />`
- The `comment.avatar` contains a relative path like `avatars/user123.jpg`
- This needs to be converted to `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/avatars/user123.jpg`

## Solution

Update the `CommentItem` component inside `CommentsSection.tsx` to call `getMediaUrl()` on the avatar before using it:

### Changes to `src/components/app/cards/CommentsSection.tsx`

1. Import `getMediaUrl` (already imported on line 31)
2. Update the `CommentItem` component to convert the avatar URL

```tsx
// Inside CommentItem component, before the return statement:
const avatarUrl = comment.avatar ? getMediaUrl(comment.avatar) : undefined;

// Then use avatarUrl instead of comment.avatar:
<AvatarImage src={avatarUrl} className="object-cover" />
```

---

## Technical Details

The `getMediaUrl` function from `src/lib/api/dehub.ts` handles this conversion:
- If the path is already an absolute URL (starts with `http://` or `https://`), it returns it unchanged
- Otherwise, it prepends the CDN base URL: `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/`

This is the same pattern already used successfully in:
- `CommentsSheet.tsx` via `CommentItem.tsx`
- `LeaderboardUserAvatar.tsx`
- Profile page components
