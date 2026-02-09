

# Fix: Stale Closure Bug in Vote Cache Updates

## Problem

The `handleVote` function in `ActionBar.tsx` uses `queueMicrotask` to write to the vote cache and patch feed caches. However, inside that microtask, it re-derives the new vote state from the **current closure values** (`isLiked`, `isDisliked`, `localLikeCount`, `localDislikeCount`). These are stale -- React's `setState` calls haven't committed yet, so the microtask reads pre-vote values and computes incorrect cache entries.

This causes:
- Like count showing 0 instead of 1 in some feeds
- `isLiked` not being set to `true` in the cache
- Inconsistent state across feeds

## Solution

Compute the new vote state **once, upfront** (before any `setState` calls), then use those computed values for both the optimistic `setState` calls AND the cache/feed-patch writes. No microtask needed.

## Technical Changes

### File: `src/components/app/cards/ActionBar.tsx`

Refactor `handleVote` to:

1. Compute `newLiked`, `newDisliked`, `newLikeCount`, `newDislikeCount` at the **top** of the function from the current state values (which are stable within the same render)
2. Use those computed values to call `setState`, `setVoteCache`, and `patchFeedCaches` directly -- no `queueMicrotask`
3. Remove the duplicated logic that currently exists inside the microtask

```
Before (broken):
  setState(optimistic)  -->  queueMicrotask(re-derive from stale closure)

After (fixed):
  compute newState  -->  setState(newState)  -->  setVoteCache(newState)  -->  patchFeedCaches(newState)
```

This is a single function refactor in one file. No new files or dependencies needed.

