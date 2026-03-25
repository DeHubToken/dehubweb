

# Fix: Notification Avatars Showing Wrong Profile Pictures on Initial Render

## Problem

The notifications page has a two-phase avatar system that causes wrong profile pictures to flash before correcting:

1. **Phase 1 (instant)**: Renders using `enrichedAvatars` from a module-level cache (`moduleAvatarCache`) which may contain stale data from previous sessions/navigations. When the cache is empty, falls back to the notification's `actorAvatar` field.
2. **Phase 2 (delayed)**: Fires `getAccountInfo` API calls for every actor, then swaps avatars when results arrive.

The module-level cache (`moduleAvatarCache`) persists across navigations but can hold outdated avatar URLs. When a user changes their PFP, the cache still serves the old one on next page load.

## Solution: Trust the notification API data, remove enrichment phase

The notification API already returns `actorAvatar` with the correct avatar path at the time of the notification. The enrichment phase (calling `getAccountInfo` per actor) is unnecessary overhead that causes the flash.

### Changes

**File: `src/pages/app/NotificationsPage.tsx`**

1. **Remove the enrichment `useEffect`** (lines ~1204-1345) that calls `getAccountInfo` for every actor address and username. This is the source of the avatar swap.

2. **Remove module-level caches** (`moduleAvatarCache`, `moduleEnrichedKeys`) and the `enrichedAvatars` state. These are no longer needed.

3. **Simplify avatar resolution in `NotificationItem`** (lines ~672-686): Use the notification's own `actorAvatar` field directly via `buildAvatarUrl(actorAddress, actorAvatarPath)` instead of the two-tier enriched-then-stale logic.

4. **Simplify `resolveActorAvatarUrl`** and related functions: Instead of looking up enrichment maps, build avatar URLs directly from the notification data (actorAddress + actorAvatar path).

5. **For aggregated notifications** (`latestActorNames`): The bundled notification avatars currently rely on enrichment to resolve usernames to avatar URLs. Instead, use the letter fallback for secondary actors (the API doesn't provide their avatars anyway), or keep a lightweight username-to-address lookup from the notifications themselves.

6. **Keep `seedProfileCache`** calls so that navigating from a notification to a profile still pre-populates the profile cache -- but seed it from the notification's own data, not from enrichment results.

### What stays the same
- The notification API layer (`src/lib/api/dehub/notifications.ts`) and its normalization logic
- The `buildAvatarUrl` and `extractAvatarPath` utilities
- Browser notification hooks
- All filter/tab/swipe UI logic

### Expected result
- Avatars render instantly from API data with zero flash
- No secondary API calls per notification actor
- Faster page load (eliminates N+1 `getAccountInfo` calls)
- Aggregated notification secondary actors show letter fallbacks (acceptable since API doesn't provide their avatars)

