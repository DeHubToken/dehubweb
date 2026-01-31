
# Fix Search Results Avatar - Field Mapping Issue

## Root Cause

The API returns `avatarImageUrl` but the code only checks for `avatarUrl`:

**API Response:**
```json
{
  "avatarImageUrl": "statics/avatars/0x5ef7cd....jpeg",
  "address": "0x5ef7cd..."
}
```

**Current Code (broken):**
```typescript
avatar: account.avatarUrl  // WRONG - field doesn't exist!
  ? buildAvatarUrl(account.address, account.avatarUrl) 
  : undefined,
```

The `SearchAccount` interface only defines `avatarUrl`, but the real API uses `avatarImageUrl` (same pattern as `DeHubUser`).

## Solution

Fix the field mapping in two places:

### 1. Update `SearchAccount` interface (`src/lib/api/dehub.ts`)

Add the `avatarImageUrl` field that the API actually returns:

```typescript
export interface SearchAccount {
  id: string;
  address: string;
  username: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  avatarImageUrl?: string;  // ADD - API returns this field
  verified?: boolean;
  followerCount?: number;
  followingCount?: number;
}
```

### 2. Update `mapAccountToCreator` function (`src/hooks/use-dehub-search.ts`)

Check both field names, matching the pattern used elsewhere in the codebase:

```typescript
export function mapAccountToCreator(account: SearchAccount): SearchCreator {
  // Check both field names - API returns avatarImageUrl
  const rawAvatarPath = account.avatarImageUrl || account.avatarUrl;
  
  return {
    id: account.address || account.id,
    name: account.displayName || account.username || 'User',
    handle: `@${account.username || account.address?.slice(0, 8)}`,
    avatar: rawAvatarPath 
      ? buildAvatarUrl(account.address, rawAvatarPath) 
      : undefined,
    verified: account.verified || false,
    bio: account.bio,
    followerCount: account.followerCount,
  };
}
```

---

## Files to Edit

| File | Change |
|------|--------|
| `src/lib/api/dehub.ts` | Add `avatarImageUrl` to `SearchAccount` interface |
| `src/hooks/use-dehub-search.ts` | Update `mapAccountToCreator` to use `avatarImageUrl \|\| avatarUrl` |
