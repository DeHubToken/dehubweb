

## Plan: Persist Optimistic Posts to localStorage

**Problem**: The optimistic posts system uses in-memory React state (`useState`). When a user uploads content, the temporary post disappears on refresh/navigation, and the API may not have indexed it yet — so the post seems to vanish.

**Solution**: Back the `OptimisticPostsProvider` with `localStorage` so optimistic posts persist across page reloads. Include an expiry mechanism (e.g. 30 minutes) to auto-clean stale entries.

### Changes

**`src/hooks/use-optimistic-posts.tsx`**:
1. On mount, initialize state from `localStorage` (key: `dehub-optimistic-posts`)
2. Filter out entries older than 30 minutes on load
3. On every add/remove/clear, sync back to `localStorage`
4. Store `createdAt` as ISO string for serialization; parse back on load
5. For media blob URLs (which don't survive refresh), store a flag so the UI can show a placeholder thumbnail instead of a broken image

This is a contained change — no other files need modification since all consumers already use the `useOptimisticPosts` hook.

