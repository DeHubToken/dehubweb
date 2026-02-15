

## Fix: Follow Status Lost in Followers List

### Problem
When the followers list items need avatar enrichment (they come as raw addresses without usernames), the `processItems` function creates placeholder objects that don't carry over the `isFollowing` and `followsYou` fields from the original API response. After a page refresh, all users incorrectly show "Follow" instead of "Following".

### Root Cause
In `src/components/app/profile/FollowersListDrawer.tsx`, lines 108-113 create placeholder objects with only `address`, `username`, `displayName`, and `avatarUrl` -- dropping `isFollowing` and `followsYou` from the original items.

### Fix (1 file)

**`src/components/app/profile/FollowersListDrawer.tsx`** -- Update the placeholder creation in `processItems` to preserve relationship fields from the original API items:

```tsx
// Before (lines 108-113):
const placeholders = items.map(item => ({
  address: item.address,
  username: undefined,
  displayName: truncateAddress(item.address),
  avatarUrl: undefined,
} as UserListItem));

// After:
const placeholders = items.map(item => ({
  address: item.address,
  username: undefined,
  displayName: truncateAddress(item.address),
  avatarUrl: undefined,
  isFollowing: item.isFollowing,
  followsYou: item.followsYou,
} as UserListItem));
```

Also preserve these fields after enrichment (around line 122):

```tsx
// Before:
return {
  ...user,
  username: enriched.username || undefined,
  displayName: enriched.displayName || enriched.username || truncateAddress(user.address),
  avatarUrl: buildAvatarUrl(user.address, enriched.avatarUrl || undefined),
};

// After (no change needed -- spread ...user already carries isFollowing/followsYou)
```

Since the enriched merge uses `...user` spread, the `isFollowing` and `followsYou` fields will be preserved automatically once they're added to the placeholders.

