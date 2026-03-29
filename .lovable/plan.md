

# Fix: Stale Optimistic Posts Persisting at Top of Feed

## Problem

Optimistic posts are stored in `localStorage` with **no expiry**. They're only removed when their real counterpart appears in the currently loaded feed page. If the API is slow to index the post, or the user refreshes before the post appears in the feed, the optimistic post lingers at the top of the feed indefinitely — even days later.

## Root Cause

`loadFromStorage()` in `use-optimistic-posts.tsx` restores all saved posts without checking their age. The auto-removal in `HomeFeed.tsx` only runs when a matching ID appears in the loaded feed items, which may never happen if the post was created long ago and is no longer on the first pages.

## Solution

Add a **TTL of 10 minutes** to optimistic posts. On load from storage, discard any posts older than 10 minutes. This is long enough for the API to index the post and for the auto-removal to kick in, but short enough that stale ghosts don't linger.

## Changes

**`src/hooks/use-optimistic-posts.tsx`** — In `loadFromStorage()`, filter out posts where `createdAt` is older than 10 minutes:

```typescript
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function loadFromStorage(): OptimisticPost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const now = Date.now();
    const parsed = JSON.parse(raw);
    return parsed
      .map(p => ({ ...p, createdAt: new Date(p.createdAt) }))
      .filter(p => now - p.createdAt.getTime() < MAX_AGE_MS) // discard stale
      .map(p => ({ ...p, mediaExpired: true }));
  } catch {
    return [];
  }
}
```

That's it — one filter line addition. No other files need changes.

