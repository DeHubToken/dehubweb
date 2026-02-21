
# Replace Custom Workarounds with New API Endpoints

After cross-referencing the new endpoints we added against the existing codebase, here are the custom workarounds that can now be replaced with proper API calls, plus the follower/following list improvements.

---

## 1. "Who to Follow" -- Replace `searchNFTs` Workaround with `getSuggestedAccounts()`

**Current problem:** Both `WhoToFollow.tsx` and `MobileWhoToFollowCarousel.tsx` scrape the `searchNFTs` endpoint (fetching up to 1,000 NFTs across 5 batches of 200), then extract unique minter addresses, filter out followed users, and display the leftovers as "suggestions." This is extremely wasteful -- it downloads massive feed payloads just to find usernames.

**Fix:** Replace with the dedicated `GET /api/suggested-accounts` endpoint we just added. This returns curated suggestions from the API directly.

### Files to change:
- **`src/components/app/WhoToFollow.tsx`** -- Remove the `fetchUserBatch` function that calls `searchNFTs`. Replace the `useInfiniteQuery` with a simple `useQuery` calling `getSuggestedAccounts()`. Remove the `getAccountInfo` call used to build the "already following" filter (the API handles this server-side). Remove auto-fetch logic for sparse results.
- **`src/components/app/mobile/MobileWhoToFollowCarousel.tsx`** -- Same changes as above, adapted for the carousel layout.

### What gets removed:
- `searchNFTs` import (no longer needed for suggestions)
- `getAccountInfo` call to fetch current user's following list for client-side filtering
- Complex 5-batch auto-fetch loop
- Client-side deduplication and filtering logic

---

## 2. Hardcoded `BLOCKED_CREATORS` Lists -- Replace with `getBlockList()` API

**Current problem:** Three separate files have the same hardcoded `BLOCKED_CREATORS` array (containing "monkey d luffy" variants) and a `BLOCKED_POST_IDS` constant. This is a static blocklist that requires code changes to update.

**Fix:** For authenticated users, fetch their dynamic block list from `GET /api/block` (the `getBlockList()` function we just added) and filter feeds using that. Keep the hardcoded lists as a fallback for unauthenticated users.

### Files to change:
- **`src/hooks/use-unified-feed.ts`** -- Add a `useQuery` for `getBlockList()` when authenticated. Merge the API block list with the hardcoded `BLOCKED_CREATORS` for filtering. The `isBlockedCreator` function checks against both lists.
- **`src/hooks/use-dehub-feed.ts`** -- Same pattern.
- **`src/hooks/use-feed-prefetch.ts`** -- Same pattern (this one has its own inline copy of the blocked list).
- **`src/components/app/feeds/MusicFeed.tsx`** -- Same pattern.

---

## 3. Follower/Following Drawer -- Remove `batch-avatars` Enrichment Workaround

**Current problem:** `FollowersListDrawer.tsx` calls `getFollowList()` and then checks if the results lack usernames. If they do, it calls the custom `batch-avatars` Edge Function to enrich raw wallet addresses with profile metadata. This two-stage enrichment was needed because the API sometimes returned bare addresses.

**Fix:** The `getFollowList()` endpoint (with `requiresAuth: true`) now returns full user objects including `username`, `displayName`, `avatarImageUrl`, `isFollowing`, and `followsYou`. The `batch-avatars` enrichment fallback is no longer needed for this use case.

### Files to change:
- **`src/components/app/profile/FollowersListDrawer.tsx`** -- Remove the `enrichAddresses()` function and the `needsEnrichment` branch in `processItems()`. Simplify to always use `mapFollowListItem()`. Remove the `supabase` import (no longer calling `batch-avatars` from this component).

---

## 4. Mutual Followers -- No Changes Needed

The `useMutualFollowers` hook already uses `getFollowList()` correctly. No custom workarounds to remove here.

---

## Summary of Impact

| Area | Before | After |
|------|--------|-------|
| Who to Follow (sidebar) | Fetches up to 1,000 NFTs via `searchNFTs`, extracts minters | Single call to `getSuggestedAccounts()` |
| Who to Follow (mobile) | Same wasteful NFT scraping | Same single API call |
| Feed blocking | Hardcoded array of 4 names | Dynamic per-user block list from API |
| Follower/Following drawer | Two-stage fetch + `batch-avatars` enrichment | Direct mapping from API response |

### Files to create:
- None

### Files to modify:
1. `src/components/app/WhoToFollow.tsx`
2. `src/components/app/mobile/MobileWhoToFollowCarousel.tsx`
3. `src/hooks/use-unified-feed.ts`
4. `src/hooks/use-dehub-feed.ts`
5. `src/hooks/use-feed-prefetch.ts`
6. `src/components/app/feeds/MusicFeed.tsx`
7. `src/components/app/profile/FollowersListDrawer.tsx`

### What stays unchanged:
- `batch-avatars` Edge Function (still used by notifications, stories, profile avatar cache)
- `BLOCKED_POST_IDS` constant (post-level blocking stays as-is -- no API equivalent)
- All API layer files we just created (no changes needed)
- `useMutualFollowers` hook (already correct)
