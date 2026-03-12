

## Why Notifications Feel Slow

The root cause is the **avatar enrichment blocking the UI**. Here's the exact sequence:

1. Notifications load from the DeHub API (fast, ~1 request)
2. The page collects every unique actor address + username from all notifications
3. It fires individual `getAccountInfo` / `getAccountByUsername` API calls for **each actor** (could be 10-30+ calls)
4. **The entire notification list is hidden behind a spinner until ALL enrichment calls finish** (line 1426: `!enrichmentReady`)

On top of that, there's a `useEffect` on mount (line 991-996) that **clears the module-level cache every time the component mounts**, defeating the purpose of the persistent cache entirely.

## The Fix

**Show notifications immediately with stale avatars, then swap in fresh ones as enrichment completes.**

### Changes

**`src/pages/app/NotificationsPage.tsx`**:

1. **Remove the cache-clearing `useEffect`** (lines 991-996). The module-level cache exists specifically to persist across navigations — clearing it on mount is contradictory and forces a full re-enrichment every visit.

2. **Remove the `enrichmentReady` gate from the render condition** (line 1426). Change:
   ```
   isLoading || (notifications.length > 0 && !enrichmentReady)
   ```
   to just:
   ```
   isLoading
   ```
   This lets notifications render instantly with the avatar data already in the API response (stale but functional). Enriched avatars swap in progressively as they resolve — no visible spinner delay.

3. **Update enrichment to be incremental** — instead of calling `setEnrichedAvatars` once after ALL fetches complete, update the state after each individual fetch resolves. This gives a progressive loading feel where avatars pop in one by one rather than all at once after a long wait.

### Result
- Notifications appear instantly after the API response
- Avatars show the stale CDN version immediately, then silently upgrade to fresh versions
- Revisiting the page uses the module-level cache (no re-enrichment, no flash)
- No more blocking spinner for enrichment

