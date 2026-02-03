
# Fix: Broken Video Thumbnail in Notifications

## Problem

The video thumbnail for "chads here" shows as broken because the notification is using an incorrect CDN URL:

**Current (broken):** `https://dehubcdn.dehub.io/images/2706.jpg`
**Correct:** `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/images/2706.jpg`

## Root Cause

In `NotificationsPage.tsx`, the thumbnail URL construction uses a typo in the CDN domain:

```typescript
const postThumbnail = notification.tokenThumbnail 
  ? (notification.tokenThumbnail.startsWith('http') 
      ? notification.tokenThumbnail 
      : `https://dehubcdn.dehub.io/${notification.tokenThumbnail}`)  // ← Wrong URL!
  : null;
```

The correct CDN base is `https://dehubcdn.ams3.cdn.digitaloceanspaces.com/` which is already defined as `DEHUB_CDN_BASE` in `src/lib/api/dehub.ts`.

## Solution

Update the thumbnail URL construction to use the proper CDN base constant or the existing `buildImageUrl` utility.

## Implementation

### File: `src/pages/app/NotificationsPage.tsx`

**Change 1: Import the CDN constant**

Add import at the top:
```typescript
import { DEHUB_CDN_BASE } from '@/lib/api/dehub';
```

**Change 2: Fix the thumbnail URL construction**

Replace lines 160-162:
```typescript
// Before (broken)
const postThumbnail = notification.tokenThumbnail 
  ? (notification.tokenThumbnail.startsWith('http') ? notification.tokenThumbnail : `https://dehubcdn.dehub.io/${notification.tokenThumbnail}`)
  : null;

// After (fixed)
const postThumbnail = notification.tokenThumbnail 
  ? (notification.tokenThumbnail.startsWith('http') ? notification.tokenThumbnail : `${DEHUB_CDN_BASE}${notification.tokenThumbnail}`)
  : null;
```

## Technical Details

| Item | Value |
|------|-------|
| Incorrect domain | `dehubcdn.dehub.io` |
| Correct domain | `dehubcdn.ams3.cdn.digitaloceanspaces.com` |
| Constant to use | `DEHUB_CDN_BASE` from `@/lib/api/dehub` |

## Result

After this fix, video thumbnails in notifications will correctly display instead of showing broken image icons.
