

## Fix: Mobile Header Avatar Not Showing

### Root Cause

The `normalizeUser` function in `AuthContext.tsx` (line 107) only reads `safe.avatarImageUrl`:

```typescript
avatarImageUrl: safe.avatarImageUrl || null,
```

But the DeHub API sometimes returns the avatar path under `avatarUrl` or `avatar_url` instead. Other parts of the codebase (e.g., `social.ts`) already handle this with a cascading fallback, but `normalizeUser` does not — so `user.avatarImageUrl` ends up `null`, and the MobileHeader condition `user.avatarImageUrl && user.address` on line 103 skips rendering `AvatarImage`.

### Fix

**`src/contexts/AuthContext.tsx`** — Update line 107 in `normalizeUser` to cascade across all avatar field names:

```typescript
avatarImageUrl: safe.avatarImageUrl || safe.avatarUrl || safe.avatar_url || null,
```

Single line change. No other files affected.

