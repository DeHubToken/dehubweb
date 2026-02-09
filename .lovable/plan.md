

# Fix: Old Likes Not Syncing Across All Feeds

## Problem

The vote cache only captures votes cast during the current session. Posts you liked in a previous session rely entirely on API data. Since different feeds (Home, Videos, Profile) fetch independently, one feed may load with `isLiked: true` while another's cache still shows `isLiked: false`. The overlay pattern means the Home feed never remounts to pick up corrected data.

## Solution

When `ActionBar` receives `isLiked: true` (or `isDisliked: true`) from its props (API data), and there's no active vote cache entry for that post, propagate that state to all other feed caches. This way, whichever feed loads the correct state first will push it to all others.

## Technical Changes

### File: `src/components/app/cards/ActionBar.tsx`

Add a new `useEffect` that fires when `initialIsLiked` or `initialIsDisliked` change. If either is `true` and there's no vote cache entry (meaning this is API-sourced, not a local vote), call `patchFeedCaches` to sync the state across all cached feeds:

```typescript
// Propagate API-sourced like/dislike state to all feed caches
useEffect(() => {
  if (!postId) return;
  // Only propagate if the API says the user has voted AND there's no local override
  if ((!initialIsLiked && !initialIsDisliked) || getVoteCache(postId)) return;
  patchFeedCaches(queryClient, postId, {
    isLiked: initialIsLiked,
    isDisliked: initialIsDisliked,
    likeCount: likeCount ?? 0,
    dislikeCount: dislikeCount ?? 0,
  });
}, [initialIsLiked, initialIsDisliked, postId]);
```

This is a single additional `useEffect` -- no new files, no new abstractions. When the Profile feed mounts and its `ActionBar` receives `isLiked: true` from the API, it will immediately patch the Home feed's React Query cache, so the hidden Home feed `ActionBar` gets updated props.

## What This Fixes

- Like a post in a previous session, open the app -- like shows on ALL feeds
- Any feed that loads the correct state first propagates it everywhere
- Works alongside the existing vote cache for new votes
