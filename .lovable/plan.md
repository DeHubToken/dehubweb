

## Fix: Followers Drawer Slow Loading

### Problem
When opening a followers/following list, the drawer blocks rendering while it sequentially paginates through the **current user's entire following list** (lines 150-166) and potentially their followers list (lines 169-185) to build local Sets for resolving `isFollowing` and `followsYou` status. Even if you only follow 3 people, each page request adds latency serially. The skeleton stays visible until **all** cache-building calls complete.

### Root Cause (lines 128-196 of FollowersListDrawer.tsx)
The `fetchInitialPage` function:
1. Fetches the actual followers page (fast)
2. **Then** sequentially loops through your following list pages (slow, blocks render)
3. **Then** optionally loops through your followers list pages (slow, blocks render)
4. Only **after all of that** does it call `setIsLoading(false)`

### Fix: Two-Phase Rendering
Split `fetchInitialPage` into two phases so the list appears instantly:

**Phase 1 (immediate):** Fetch the followers/following page, map items, set `isLoading = false`, and render the list immediately. Follow buttons show a subtle loading state (disabled).

**Phase 2 (background):** Build the `followingSet` and `followersSet` in parallel using `Promise.all` (instead of sequential while-loops). Once resolved, patch the displayed users with correct `isFollowing`/`followsYou` states.

### Technical Changes

**`src/components/app/profile/FollowersListDrawer.tsx`:**

1. Add a new state: `const [isResolvingStatus, setIsResolvingStatus] = useState(false);`

2. In `fetchInitialPage` (lines 121-216):
   - After fetching the list (line 129-135), immediately map items and call `setUsers(processed)`, `setIsLoading(false)`
   - Move the following/followers cache-building (lines 150-185) into a separate `async` block that runs after render:
     ```typescript
     // Phase 1: render immediately
     setUsers(processed);
     setIsLoading(false);
     setIsResolvingStatus(true);

     // Phase 2: resolve follow status in background
     try {
       if (!isOwnFollowingList && isAuthenticated && currentUserAddress && !followingSetRef.current) {
         const allFollowing: string[] = [];
         let page = 1, hasMore = true;
         while (hasMore) {
           const res = await getFollowList(currentUserAddress, 'following', { page, limit: FOLLOWING_CACHE_PAGE_SIZE });
           allFollowing.push(...res.items.map(f => (f.address || '').toLowerCase()));
           hasMore = res.pagination?.hasMore ?? false;
           page++;
           if (page > 10) break;
         }
         followingSetRef.current = new Set(allFollowing);
       }
       // Same for followersSet...

       // Patch users with resolved status
       setUsers(prev => prev.map(u => ({
         ...u,
         isFollowing: followingSetRef.current?.has(u.address.toLowerCase()) ?? u.isFollowing,
         followsYou: /* resolved value */,
       })));
     } finally {
       setIsResolvingStatus(false);
     }
     ```

3. Disable follow buttons while `isResolvingStatus` is true (show them but non-interactive with a subtle opacity). Once status resolves, buttons become active with correct labels.

4. In the follow button rendering (line 510-543), add `disabled={... || isResolvingStatus}` and reduce opacity when resolving.

This means the drawer opens nearly instantly (single API call), and follow button states resolve ~0.5-2s later in the background.

