# Improve perceived load speed of the home page

## Problem

Today, when a user hits `/app` (or `/`), they see a **plain black screen** for several seconds before anything appears. The reason is a chain of waterfalls:

```text
HTML  ->  main.tsx  ->  React/Router  ->  WalletProviders chunk (~1.5 MB)
                                             |
                                             v
                                          AppContent  ->  HomePage chunk
                                             |
                                             v
                                          HomeFeed mounts -> HomeFeedSkeleton
                                             |
                                             v
                                          API fetch -> real feed
```

The `<Suspense>` fallbacks during this chain are all `<div className="min-h-screen bg-black" />` (`PageLoader` and `WalletLoader` in `src/App.tsx`). Skeletons only appear once the HomePage chunk has loaded, which is the slowest step.

## Goal

The user should see the home feed skeleton **the instant the HTML lands**, and the real feed should appear as soon as possible after that — no black flashes, no skeleton swaps.

## Plan

### 1. Inline a static skeleton in `index.html`
Render a hand-written HTML/CSS version of `FeedSkeleton` (stories bar + 3 card placeholders) inside `#root` directly in `index.html`, with the same liquid-glass styles already defined in the critical CSS block. This means the skeleton paints on first byte, before any JS executes. React will replace `#root` contents on mount, so no cleanup is needed.

Constraints: keep markup small (<3 KB), use only inline styles + the existing critical CSS, no external images, respect `prefers-reduced-motion` for the shimmer.

### 2. Replace black Suspense fallbacks with the real skeleton
In `src/App.tsx`:
- `WalletLoader` and `PageLoader` currently render a black div. Switch both to render `<FeedSkeleton />` (from `src/components/app/PageSkeletons.tsx`) wrapped in the same chrome the AppLayout would use, so the skeleton stays visible continuously through:
  HTML skeleton → Suspense (wallet chunk) → Suspense (HomePage chunk) → HomeFeed's own skeleton → real cards.
- Move `FeedSkeleton` import to be eagerly bundled (not lazy) so it's available the moment React mounts.

### 3. Parallelize chunk loading
Currently `WalletProviders` blocks `AppContent`, which blocks the `HomePage` chunk download. Kick off the `HomePage` chunk in parallel from `src/App.tsx` (top-level side effect, same pattern already used for `preloadCriticalChunks`). Also add `<link rel="modulepreload">` hints in `index.html` for the HomePage chunk if Vite's manifest exposes a stable name; otherwise rely on the JS-side `import()`.

### 4. Warm the home feed query before HomePage mounts
The home feed's network request currently starts only after `HomeFeed` mounts (after wallet + HomePage chunks load). Add a lightweight prefetch in `src/main.tsx` (or a tiny module imported synchronously by it) that:
- Calls the same `searchNFTs` / unified-feed endpoint used by the default Home tab.
- Stores the result in the existing React Query client via `queryClient.prefetchQuery` once `QueryClientProvider` mounts (or seeds a module-level cache the hook reads).

This means the feed API call runs concurrently with the wallet bundle download, so by the time `HomeFeed` renders, data is often already in cache and the skeleton swaps straight to real content.

### 5. Smooth the skeleton -> content transition
- Remove the `animate-fade-in` on the first activation of the home `CachedPage` when the HTML skeleton was already visible — a fade looks worse than a direct swap when the layouts match.
- Make sure the inline HTML skeleton, `FeedSkeleton`, and `HomeFeedSkeleton` use **identical** spacing/widths so there's no visual jump between the three stages.

### 6. Verify
- Throttled "Slow 4G" + 4× CPU in Chrome devtools: confirm a skeleton is visible at the first paint (≤ ~200 ms) and that there is no black flash at any handoff.
- iOS Safari 15: confirm the inline skeleton renders (no `backdrop-filter` reliance — use solid `rgba(255,255,255,0.06)` like existing skeletons).

## Files to change
- `index.html` — inline skeleton + optional modulepreload
- `src/App.tsx` — replace black loaders with `FeedSkeleton`, kick off HomePage chunk preload in parallel with WalletProviders
- `src/main.tsx` (or a new `src/lib/prefetch-home-feed.ts`) — warm feed query
- `src/components/app/PersistentPageCache.tsx` — skip first-mount fade for `home`
- `src/components/app/PageSkeletons.tsx` — minor tweak so dimensions match the inline HTML skeleton

## Out of scope
- No changes to the actual feed API or data layer.
- No changes to other pages' skeletons (only home is targeted, since that's the entry route).
