

## Fix: Followers/Following List Not Loading

### Root Cause

The `/api/follow_list/{address}` endpoint returns **raw wallet address arrays** (e.g., `["0x26eeb...", "0x6f78..."]`), but the code expects fully structured user objects with `username`, `displayName`, `avatarImageUrl`, etc.

When `mapFollowListItem` receives a plain string instead of an object, every field resolves to `undefined`, causing the list to render broken/empty items.

Evidence from the network logs -- the `account_info` response for the same user shows the same data shape:
```text
"followersList": ["0x26eeb761c7c88d9d1f0a688ced47f3a77c53b70c", "0x6f7800748dc7b61fda62e2ca4e21ad37a7ff6177"]
```

### Solution

**Two-step resolution:** handle the raw address response, then enrich each address into a full user profile using the existing `batch-avatars` edge function (which already fetches `account_info` for multiple addresses in parallel).

### Changes

#### 1. Update `getFollowList` in `src/lib/api/dehub.ts`

- Detect whether the API returned an array of strings (addresses) vs. an array of objects
- If strings, return them in a minimal shape `{ address: "0x..." }` so the caller knows enrichment is needed

#### 2. Update `FollowersListDrawer.tsx`

- After receiving the raw address list from `getFollowList`, call the `batch-avatars` edge function to resolve each address into `username`, `displayName`, `avatarUrl`
- Merge the enriched data back into the user list items
- Show skeleton loading while enrichment is in progress
- Handle the case where some addresses fail to resolve (show truncated address as fallback)

### Flow

```text
User clicks "Followers" or "Following"
        |
        v
getFollowList("/api/follow_list/{address}")
        |
        v
API returns: { result: ["0xabc...", "0xdef..."] }
        |
        v
Detect: items are strings, not objects
        |
        v
Call batch-avatars edge function with address array
        |
        v
Receive enriched data: { avatars: { "0xabc": { username, displayName, avatarUrl }, ... } }
        |
        v
Merge into UserListItem[] and render
```

### Technical Details

**`src/lib/api/dehub.ts` -- `getFollowList` function:**
- After unwrapping the `result`, check if items are strings via `typeof items[0] === 'string'`
- If so, map each string to `{ address: string }` as a `FollowListItem`
- This keeps the return type consistent

**`src/components/app/profile/FollowersListDrawer.tsx`:**
- After `getFollowList` returns, check if items lack usernames (i.e., they were raw addresses)
- If enrichment is needed, POST to the `batch-avatars` edge function with the address list
- Merge the returned `avatarMap` data (username, displayName, avatarUrl) into each item
- Add the viewer's address to get `isFollowing` status via `is_following` API calls (or skip for simplicity and just show follow buttons that check on click)
- Fallback display: show truncated wallet address (e.g., `0x26ee...b70c`) when username is unavailable

