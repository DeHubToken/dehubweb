## Goal
Make `/app` use one stable loading system from first paint to real content: the top nav skeleton must stay visible until the real nav is ready, and there must be no last-second secondary skeleton flash before the feed appears.

## What I will change

1. Restore a real nav-bar skeleton in the boot/app shell
- Rebuild the top-center nav skeleton in the shared shell loader instead of removing it.
- Make the HTML boot loader and the React shell loader render the same nav skeleton so the top bar does not disappear mid-handoff.

2. Make one component own the home loading state
- Stop letting the home feed show its own full fallback after the shell is already mounted.
- Keep the shell responsible for the initial `/app` loading experience, and prevent `HomeFeed` from swapping back into a generic `FeedSkeleton` right before data lands.

3. Remove the late home-feed flash
- Replace the current `HomeFeed` loading branch with a strategy that preserves the mounted top area and avoids a second full-column placeholder pass.
- Keep only content-area placeholders if absolutely needed, never another shell-like phase.

4. Keep nav ownership consistent on desktop/mobile
- Match the skeleton to the real nav owner for each mode:
  - mobile: `HomePage` sticky feed nav under `MobileHeader`
  - collapsed desktop: `GlobalFeedNav`
  - expanded desktop: `HomePage` feed nav
- Ensure the skeleton does not vanish when `isCollapsed` / scroll-visibility logic resolves.

5. Verify the full handoff path
- Check the full chain for `/app`: `index.html` boot skeleton → `App.tsx` Suspense fallback → `AppLayout` mount → `PersistentPageCache` home mount → `HomePage` / `HomeFeed` data readiness.
- Confirm there is exactly one perceived loader sequence, with no disappearing nav strip and no second flash before content.

## Files to update
- `index.html`
- `src/components/app/PageSkeletons.tsx`
- `src/App.tsx`
- `src/components/app/AppLayout.tsx`
- `src/components/app/PersistentPageCache.tsx`
- `src/components/app/feeds/HomeFeed.tsx`

## Technical details
- Current issue is not just duplication; it is a loader ownership mismatch.
- The nav skeleton was removed from one layer, so the header area now drops out during handoff.
- A second loading phase still exists in `HomeFeed` via `(isLoadingState || isAutoRetrying) ? <FeedSkeleton />`, which can reintroduce a full feed skeleton after the main shell is already mounted.
- The fix is to split shell loading from feed-data loading cleanly:
  ```text
  Boot/route loading: shell skeleton owns nav + frame
  Feed-data loading: content placeholders only, no shell reset
  ```
- I will preserve existing layout spacing and sticky offsets so there is no jump when the real UI replaces the skeleton.

## Validation
- Reload `/app` in desktop preview and confirm:
  - nav skeleton is visible during preload
  - nav skeleton does not disappear before the real nav appears
  - no secondary flash occurs right before content loads
  - sidebars stay stable
- Check mobile width too to ensure the home sticky tab bar handoff is stable there as well.