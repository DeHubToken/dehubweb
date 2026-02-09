

# Fix: Followers List Returns Empty Due to Changed API Response Shape

## Problem

The `/api/follow_list` endpoint now returns a **paginated** response with user data nested inside each item:

```text
Old: { result: [ { address, username, ... } ] }
New: { result: { items: [ { followedAt, user: { address, username, ... } } ], pagination: {...} } }
```

The current `getFollowList` function unwraps `response.result` and expects it to be an array. Instead it gets an object `{ items: [...], pagination: {...} }`, which fails the `Array.isArray` check and returns `[]` -- hence "No followers yet."

## Changes

### File: `src/lib/api/dehub.ts` (lines 985-1019)

1. Update `getFollowList` to handle the new paginated response shape:
   - After unwrapping `result`, check if it's an object with an `items` array
   - Extract `items` from `result.items` when present
   - Each item is now `{ followedAt, user: {...} }` -- extract the `.user` object and map it to `FollowListItem`
   - Keep backward compatibility with the old flat array format

2. Map the nested `user` object fields (`address`, `username`, `displayName`, `avatarImageUrl`, `followers`, `isPrivate`, `hideFollowers`) to the existing `FollowListItem` interface.

The updated logic will be roughly:

```
const raw = response.result;
let items;
if (raw && typeof raw === 'object' && 'items' in raw) {
  // New paginated format: { items: [{ followedAt, user }], pagination }
  items = raw.items.map(entry => entry.user || entry);
} else if (Array.isArray(raw)) {
  items = raw; // Old format
} else {
  return [];
}
```

No other files need changes -- `FollowersListDrawer.tsx` and `mapFollowListItem` already handle the `FollowListItem` shape correctly. The `needsEnrichment` path (batch-avatars) will no longer be needed since the new API already returns full user objects, but it stays as a safe fallback.
