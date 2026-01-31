
# Fix Search Results Avatar Rendering

## Problem
The avatars in search results show fallback icons instead of actual images because the URL is being **double-processed** through `buildAvatarUrl`.

## Root Cause Analysis

The `SearchCreator` type's `avatar` field is **already a fully built URL** - it's processed through `buildAvatarUrl` inside:
- `mapAccountToCreator()` (line 101-103)
- `extractUniqueCreators()` (line 129)

But `UserResultCard` in ExplorePage calls `buildAvatarUrl` **again** on an already-processed URL:
```typescript
// BROKEN - double processing
const avatarUrl = useMemo(() => {
  if (user.avatar && user.id) {
    return buildAvatarUrl(user.id, user.avatar); // user.avatar is already a full URL!
  }
  return undefined;
}, [user.avatar, user.id]);
```

This corrupts the URL because `buildAvatarUrl` expects a relative path like `avatars/0x123.png`, not a full URL like `https://cdn.dehub.io/avatars/0x123.png`.

## Solution
Use `user.avatar` directly since it's already processed - just like `WhoToFollow` does with its `getAvatarUrl` helper but simpler since the data is pre-processed.

---

## Technical Changes

### File: `src/pages/app/ExplorePage.tsx`

**Current (broken):**
```typescript
const UserResultCard = ({ user }: { user: SearchCreator }) => {
  const navigate = useNavigate();
  
  // Build proper avatar URL using same logic as WhoToFollow
  const avatarUrl = useMemo(() => {
    if (user.avatar && user.id) {
      return buildAvatarUrl(user.id, user.avatar);
    }
    return undefined;
  }, [user.avatar, user.id]);
```

**Fixed:**
```typescript
const UserResultCard = ({ user }: { user: SearchCreator }) => {
  const navigate = useNavigate();
  
  // user.avatar is already a fully built URL from mapAccountToCreator/extractUniqueCreators
  const avatarUrl = user.avatar;
```

Remove the unnecessary `useMemo` import if no longer used elsewhere, and remove the `buildAvatarUrl` import if not used elsewhere in the file.
