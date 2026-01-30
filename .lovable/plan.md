
# Fix Sidebar Profile Picture Not Showing

## Problem

The sidebar shows "E" (initial letter fallback) instead of Erwin's profile picture because the `avatarImageUrl` from AuthContext is a **relative path** (e.g., `avatars/0x123...abc.jpg`) that the browser can't load.

## Root Cause Analysis

| Component | What it does | URL Type |
|-----------|--------------|----------|
| **AuthContext** | Stores raw API response | Relative path (`avatars/xxx.jpg`) |
| **DesktopSidebar** | Reads `user?.avatarImageUrl` directly | Relative path (broken) |
| **ProfilePage** | Uses `buildAvatarUrl()` utility | Full CDN URL (works) |

The ProfilePage correctly processes the raw avatar path through `buildAvatarUrl()`, but the sidebar skips this step.

## Solution

Import `buildAvatarUrl` in DesktopSidebar and use it to convert the relative path to a full CDN URL:

```typescript
// Before (broken)
const userAvatarUrl = user?.avatarImageUrl || null;

// After (fixed)
const userAvatarUrl = user?.avatarImageUrl && user?.address 
  ? buildAvatarUrl(user.address, user.avatarImageUrl) 
  : null;
```

## Changes Required

### File: `src/components/app/navigation/DesktopSidebar.tsx`

1. **Add import** for `buildAvatarUrl`:
   ```typescript
   import { buildAvatarUrl } from '@/lib/media-url';
   ```

2. **Update line 68** to process the avatar URL:
   ```typescript
   // Before
   const userAvatarUrl = user?.avatarImageUrl || null;
   
   // After
   const userAvatarUrl = user?.avatarImageUrl && user?.address
     ? buildAvatarUrl(user.address, user.avatarImageUrl)
     : null;
   ```

## Technical Details

The `buildAvatarUrl()` function:
- Takes the user's wallet address and the raw avatar path
- Returns a full CDN URL: `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/avatars/{address}.{ext}`
- Already handles edge cases (null input, already-absolute URLs)

## Expected Result

After this fix, the sidebar Profile nav item will show Erwin's actual profile picture instead of the "E" fallback letter.
