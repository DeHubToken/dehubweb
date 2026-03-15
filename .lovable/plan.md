

# Background Preloading of Priority Pages

## Problem
Currently pages only load their JS chunks when first visited. This means the first navigation to Explore, Profile, Notifications, etc. has a noticeable delay while the chunk downloads and the component mounts.

## Strategy
After the home page finishes its initial render and the browser is idle, we progressively preload the **JS chunks only** (not mount the components) for priority pages. This is a two-phase approach:

1. **Phase 1 — Chunk preload** (lightweight): Use `requestIdleCallback` to trigger `import()` calls that download and cache the JS modules. This doesn't mount any React components or fire API calls — it just warms the browser's module cache.

2. **Phase 2 — Staggered timing**: Space out the preloads with delays (e.g. 3s after initial render for the first batch, then 6s for the second) so they never compete with the home feed's API calls or rendering.

## Priority pages to preload
- **Batch 1** (3s after home renders): Explore, Profile, Notifications
- **Batch 2** (6s after home renders): Messages, Settings, Wallet

All other pages (Music, TV, Agents, Careers, etc.) remain on-demand.

## Implementation

### File: `src/lib/preload-priority-pages.ts` (new)
A standalone module that exports a `preloadPriorityPages()` function. It uses `requestIdleCallback` (with `setTimeout` fallback) to schedule staggered dynamic `import()` calls. Each import is wrapped in a `.catch(() => {})` so failures are silent. A sessionStorage flag prevents re-preloading on the same session.

### File: `src/components/app/PersistentPageCache.tsx` (edit)
Add a one-time `useEffect` that calls `preloadPriorityPages()` after the home page has mounted. This only preloads the JS — when the user navigates, `lazyWithRetry` resolves instantly from the cached module.

## Technical detail
- `import('@/pages/app/ExplorePage')` called in idle time downloads the chunk but doesn't execute React rendering
- When `React.lazy` later resolves the same import path, Vite/browser serves it from cache — instant
- No component mounting, no API calls, no DOM changes — zero visual impact
- `requestIdleCallback` ensures we only preload when the main thread is free

