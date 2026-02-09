

# Fix: Vote State Not Persisting When Returning to Feed

## Problem

The Home feed uses an "overlay pattern" where the `HomePage` stays mounted (just set to `hidden`) when navigating to a dedicated post page or profile. When you come back, the same `ActionBar` instances are still alive with their original state -- they never remount, so the vote cache is never re-read.

The profile page works because it's a completely fresh mount, so `ActionBar` reads the vote cache during initialization.

## Root Cause

- `ActionBar` only reads `getVoteCache(postId)` once: during `useState` initialization (mount time)
- The sync `useEffect` hooks only fire when props like `initialIsLiked` change -- but the feed data hasn't refetched, so props don't change
- Result: the feed's `ActionBar` instances stay stuck on the pre-vote state

## Solution

Add a single `useEffect` in `ActionBar` that re-checks the vote cache whenever the component becomes "active" again. Since we can't easily detect visibility of a hidden parent, the simplest robust approach is to **re-check the vote cache on an interval or via a focus/visibility listener**.

However, the cleanest fix is simpler: **update the React Query feed cache directly when a vote is cast**, so the feed items themselves carry the correct `isLiked`/`isDisliked` values. This way, even hidden `ActionBar` instances receive updated props.

### Approach: Update Feed Cache on Vote

When a vote is cast in `ActionBar`, in addition to the vote cache, also update the relevant React Query feed caches (`unified-feed`, `dehub-videos`, etc.) so the underlying feed data reflects the vote. This means:

1. The hidden Home feed's data gets patched
2. When the user returns, the `ActionBar` props are already correct
3. No timers or visibility listeners needed

### File Changes

**`src/components/app/cards/ActionBar.tsx`**

- Import `useQueryClient` from `@tanstack/react-query`
- After computing the new vote state (in the `handleVote` callback), call a helper that patches matching post entries across all feed query caches
- The helper iterates known feed query keys and updates the matching `postId`'s `isLiked`, `isDisliked`, and vote counts in-place using `queryClient.setQueryData`

**`src/lib/vote-cache.ts`** (extend)

- Add a new exported function `patchFeedCaches(queryClient, postId, voteState)` that:
  - Iterates query keys like `['unified-feed']`, `['dehub-videos']`, `['dehub-images']`, `['profile-content']`
  - For each cached page of data, finds the item matching `postId` and patches its vote fields
  - Uses `queryClient.setQueriesData` for efficient bulk updates

This ensures the feed data stays consistent with the user's actions regardless of the overlay pattern, navigation, or cache TTL.

## What This Fixes

- Like a post in the feed, navigate to its page, come back to feed -- like persists
- Like a post on a profile, go back to the feed -- like persists
- Works bidirectionally across all navigation patterns
- No dependency on timers or TTL expiration

