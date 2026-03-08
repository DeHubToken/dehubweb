

## Why the Followers Drawer is Slow

The bottleneck is on **lines 134-142** of `FollowersListDrawer.tsx`. After fetching the follow list (1 API call), it fires **N parallel `checkIsFollowing` calls** — one per user — to determine follow status. For a page of 30 users, that's up to **30 additional API requests** hitting the DeHub API simultaneously. This is what causes:

1. Slow load time (waiting for 30 serial/parallel round-trips)
2. Potential 429 rate-limit errors (already visible in network logs)

### The Fix

The `getFollowList` API response already includes `isFollowing` on each item (visible in `mapFollowListItem` at line 65: `isFollowing: item.isFollowing`). The code just doesn't trust it — it falls through to individual `checkIsFollowing` calls when `isFollowing` could be undefined.

**Change in `FollowersListDrawer.tsx`:**

1. **Remove the bulk `checkIsFollowing` calls** (lines 134-145 for initial load, and lines 197-205 for load-more). Instead, trust the `isFollowing` field already returned by the API. If it's undefined, default to `false` rather than making an extra API call.

2. This turns the drawer from **1 + N API calls** down to **1 API call** per page load.

3. Same change for the `loadMore` function (lines 189-208) — remove the parallel `checkIsFollowing` block there too.

The mapped items from `mapFollowListItem` already extract `isFollowing` from the API response. The only code change is replacing the `Promise.all(checkIsFollowing(...))` blocks with a simple pass-through that defaults undefined values to `false`.

### Result
- Drawer opens in ~1 API call instead of ~31
- No more 429 rate-limit risk from the drawer
- Infinite scroll pages also load with 1 call each

