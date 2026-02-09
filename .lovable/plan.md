

# Fix: Vote State Not Persisting Across Page Navigations

## Problem

When you like a post in the feed, then navigate to its dedicated page (or a profile), a brand-new `ActionBar` component mounts. It initializes from the API data (which hasn't updated yet), so the like reverts to "not liked." The existing vote guard only protects against prop changes within the **same** component instance -- it doesn't survive navigation.

## Solution

Create a lightweight **global in-memory vote store** (a simple `Map`) that:
1. Gets written to whenever the user votes (in `ActionBar`)
2. Gets read on mount by any new `ActionBar` instance to override stale API props
3. Entries auto-expire after 30 seconds (by which time the API should reflect the change)

No React Context needed -- just a plain module-level `Map` for zero overhead.

## Technical Details

### 1. New file: `src/lib/vote-cache.ts`

A minimal module exporting three functions:

```typescript
// In-memory map: postId -> { isLiked, isDisliked, likeCount, dislikeCount, timestamp }
const cache = new Map();
const TTL = 30_000; // 30 seconds

export function setVoteCache(postId, state) { ... }
export function getVoteCache(postId) { ... } // returns entry or null if expired/missing
export function clearVoteCache(postId) { ... }
```

### 2. Update: `src/components/app/cards/ActionBar.tsx`

- **On mount**: Check `getVoteCache(postId)`. If a valid entry exists, use its values instead of the props from the API.
- **On vote**: Call `setVoteCache(postId, { isLiked, isDisliked, likeCount, dislikeCount })` alongside the existing optimistic update.
- **Sync effects**: Also check the vote cache before allowing prop-based sync (strengthens the existing vote guard).

### 3. Update: `src/lib/post-cache.ts`

When building the cached NFT data before navigation (`cacheVideoForNavigation`, `cacheImageForNavigation`, `cacheTextPostForNavigation`), check the vote cache and merge any recent vote state into the cached data. This way, even the initial props passed to `ActionBar` on the dedicated page are already correct.

## What This Fixes

- Like a post in feed, open dedicated page -- like persists
- Like a post in feed, open creator's profile -- like persists on their posts
- Like on dedicated page, go back to feed -- like persists
- Works for dislikes and vote switching too
