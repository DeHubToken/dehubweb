

## Problem

The `follow_list` API does **not** return an `isFollowing` field per user. The network response shows each item has only `followedAt` and a `user` object with profile data — no `isFollowing`. So after our optimization, `u.isFollowing ?? false` always resolves to `false`, making every button show "Follow".

The old code made N parallel `checkIsFollowing` calls to resolve this, which was slow but correct.

## Fix: Fetch current user's following list once, cross-reference locally

Instead of N individual API calls, fetch the current user's following list **once** (a single API call) and build a `Set` of addresses. Then cross-reference each user in the drawer against that set.

**Changes in `FollowersListDrawer.tsx`:**

1. **Initial load** (~line 123-133): After fetching the follow list, also fetch the current user's following list via `getFollowList(currentUserAddress, 'following', { limit: 300 })`. Build a `Set<string>` of lowercase addresses. Map `isFollowing` by checking set membership.

2. **Cache the set** in a `useRef` so `loadMore` can reuse it without re-fetching.

3. **loadMore** (~line 175-184): Use the cached following set to resolve `isFollowing` for new pages.

4. Skip the extra fetch if not authenticated or if it's the user's own "Following" list (already handled with `isFollowing: true`).

**Result**: 2 API calls on open (follow list + current user's following list) instead of 1 + N. The current user's following list is fetched once and reused for all pages.

