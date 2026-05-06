## What I verified
- On a hard load of `/app`, I saw an initial full-page boot skeleton with the red announcement banner.
- A few seconds later, that hands off to a second React-driven loading state before the real feed appears.
- In code, the extra stage comes from two separate app-level loaders after the HTML boot paint:
  1. `AppLayout.tsx` mounts a full-screen `HomeShellSkeleton` overlay.
  2. `HomeFeed.tsx` can still render `FeedCardSkeletonList` while feed queries are resolving.

## Plan
1. **Remove the redundant app-level boot overlay**
   - Delete the `/app` startup overlay in `src/components/app/AppLayout.tsx` that renders `HomeShellSkeleton` on top of the page.
   - Keep the raw HTML boot shell in `index.html` as the only first-paint loader.

2. **Prevent the feed from showing a second startup skeleton**
   - Update `src/components/app/feeds/HomeFeed.tsx` so the initial `/app` load does not swap from the HTML boot shell into `FeedCardSkeletonList`.
   - Only mark boot as ready once the feed can render real content, a valid empty state, or a stable retry/error state.

3. **Keep the banner-first behavior intact**
   - Preserve the announcement banner in the initial HTML so it still paints immediately before the app hydrates.
   - Do not change unrelated page loading states.

4. **Verify in preview before confirming**
   - Hard reload `/app` in the browser preview.
   - Watch the full sequence and confirm it goes from **HTML boot shell → real feed** with no intermediate full-page/skeleton stage.
   - Re-check desktop behavior specifically, since that is where the duplicate shell is most visible.

## Technical notes
- Files likely touched:
  - `src/components/app/AppLayout.tsx`
  - `src/components/app/feeds/HomeFeed.tsx`
- `index.html` should likely remain the single source of the first-paint shell unless verification shows it also needs cleanup.