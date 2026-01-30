
# Fix: Profile Pictures in Comments (Final)

## Root Cause Confirmed

The `buildAvatarUrl` utility was correctly updated to convert `api.dehub.io` URLs to CDN URLs. However, `CommentsSection.tsx` (and other files) have **inline logic that bypasses the utility entirely** when the URL starts with `http`:

```typescript
// BROKEN CODE IN CommentsSection.tsx (lines 106-110)
if (rawAvatarPath) {
  resolvedAvatar = rawAvatarPath.startsWith('http') 
    ? rawAvatarPath  // <-- BYPASSES buildAvatarUrl!
    : (address ? buildAvatarUrl(address, rawAvatarPath) : undefined);
}
```

This short-circuits the fix because `api.dehub.io` URLs start with `http`, so they never get converted to CDN URLs.

Meanwhile, the **working sidebar components** (`SidebarLeaderboard.tsx`, `WhoToFollow.tsx`) call `buildAvatarUrl` directly without any pre-checks:

```typescript
// WORKING CODE IN sidebar components
return buildAvatarUrl(entry.account, entry.avatarUrl);
```

---

## Solution

Remove the inline `startsWith('http')` check and always pass through `buildAvatarUrl`. The utility already handles all URL formats correctly.

---

## Files to Update

### 1. `src/components/app/cards/CommentsSection.tsx`

Replace lines 105-110:
```typescript
// Before (broken)
let resolvedAvatar: string | undefined;
if (rawAvatarPath) {
  resolvedAvatar = rawAvatarPath.startsWith('http') 
    ? rawAvatarPath 
    : (address ? buildAvatarUrl(address, rawAvatarPath) : undefined);
}

// After (fixed)
const resolvedAvatar = address && rawAvatarPath 
  ? buildAvatarUrl(address, rawAvatarPath) 
  : undefined;
```

### 2. `src/components/app/feeds/MusicFeed.tsx`

Replace lines 80-82:
```typescript
// Before (broken)
const avatarUrl = rawAvatarUrl?.startsWith('http') 
  ? rawAvatarUrl 
  : buildAvatarUrl(minterAddress, rawAvatarUrl);

// After (fixed)
const avatarUrl = minterAddress && rawAvatarUrl 
  ? buildAvatarUrl(minterAddress, rawAvatarUrl) 
  : undefined;
```

### 3. `src/components/app/feeds/VideosFeed.tsx`

Replace lines 175-177:
```typescript
// Before (broken)
const avatarUrl = rawAvatarUrl?.startsWith('http') 
  ? rawAvatarUrl 
  : buildAvatarUrl(minterAddress, rawAvatarUrl);

// After (fixed)
const avatarUrl = minterAddress && rawAvatarUrl 
  ? buildAvatarUrl(minterAddress, rawAvatarUrl) 
  : undefined;
```

---

## Why This Works

The `buildAvatarUrl` utility already handles ALL cases:

| Input Type | `buildAvatarUrl` Behavior |
|------------|---------------------------|
| `https://dehubcdn...` | Returns as-is |
| `https://api.dehub.io/avatars/...` | Converts to CDN URL |
| `avatars/xxx.jpg` | Builds CDN URL |
| Other `http://...` URLs | Returns as-is |

By always calling `buildAvatarUrl`, we leverage the central fix and ensure consistency across all components.

---

## Technical Details

This is the same pattern used by the **working** sidebar components. The fix is minimal: remove the redundant `startsWith('http')` check that was incorrectly bypassing the utility function.

After this fix, all components will correctly route through `buildAvatarUrl`, which handles the `api.dehub.io` → CDN conversion.
