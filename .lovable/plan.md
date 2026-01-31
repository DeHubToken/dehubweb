
# Fix Profile Pictures in DM User Search

## Problem
Profile pictures in the new message search modal work for some users (like `maldoteth`) but not others (like `@mike`). The issue is that the current code uses `getMediaUrl()` which only prepends the CDN base URL, but avatars need the **canonical URL format** that includes the user's wallet address.

## Root Cause
The `NewConversationModal` component uses:
```typescript
const avatarUrl = getMediaUrl(user.avatarImageUrl || user.avatarUrl);
```

But it should use the same pattern as `WhoToFollow`:
```typescript
const getAvatarUrl = (user) => {
  if (user.avatarUrl && user.address) {
    return buildAvatarUrl(user.address, user.avatarUrl);
  }
  return undefined;
};
```

The `buildAvatarUrl` function constructs the proper CDN URL: `https://dehubcdn.../avatars/{address}.{ext}` - this is why some users work (if their avatar path happens to match) while others don't.

## Solution

### Step 1: Update NewConversationModal to use buildAvatarUrl
- Import `buildAvatarUrl` and `extractAvatarPath` from `@/lib/media-url`
- Use the same avatar resolution pattern as `WhoToFollow`
- Extract avatar path using `extractAvatarPath` utility (handles all API field variations)
- Build proper CDN URL using `buildAvatarUrl(address, avatarPath)`

### Technical Changes

**File: `src/components/app/chat/NewConversationModal.tsx`**

```typescript
// Change import from:
import { getMediaUrl, type DeHubUser, type DeHubConversation } from '@/lib/api/dehub';

// To:
import { type DeHubUser, type DeHubConversation } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';

// In UserSearchResult component, change:
const avatarUrl = getMediaUrl(user.avatarImageUrl || user.avatarUrl);

// To:
const avatarPath = extractAvatarPath(user);
const avatarUrl = user.address ? buildAvatarUrl(user.address, avatarPath) : undefined;
```

This matches exactly how the `WhoToFollow` side panel renders avatars successfully.
