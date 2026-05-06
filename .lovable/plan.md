## Goal

Make `/app` show exactly one loading skeleton on first load, with no second/duplicate nav-bar flash underneath the main one.

## What to change

1. Keep the outer app-shell loader as the only full-page first-load skeleton
   - Continue using `HomeShellSkeleton` for the top-level app fallbacks in `src/App.tsx`.
   - Do not introduce any additional shell or nav skeleton after that first handoff.

2. Remove the home page’s secondary nav-style fallback inside the cached page system
   - In `src/components/app/PersistentPageCache.tsx`, stop using `FeedSkeleton` as the Suspense fallback for the cached `home` page.
   - Replace the home-page fallback with a home-specific center-column loader that does not render the sticky tab/nav strip at all.
   - Keep other page fallbacks unchanged.

3. Split the current home feed skeleton into two roles in `src/components/app/PageSkeletons.tsx`
   - Preserve the existing full-shell loader used before the app mounts.
   - Add a center-column-only fallback variant for the home page content area that excludes the top sticky feed nav skeleton.
   - Keep sizing/spacing consistent with the live feed cards so the content area still feels stable during lazy load.

4. Verify the loaded home UI does not stack two nav bars
   - The real top navigation should come from the already-mounted app shell (`GlobalFeedNav` / `HomePage` behavior), not from a fallback skeleton.
   - First load should transition from boot shell directly into the real layout without a second nav-like placeholder appearing.

## Technical notes

- Root cause: there are two loading layers for `/app`:
  1. the top-level `HomeShellSkeleton` used by the app/router fallbacks
  2. the cached home-page Suspense fallback (`FeedSkeleton`) inside `PersistentPageCache`
- `FeedSkeleton` currently includes a sticky tab-bar skeleton, which visually duplicates the real home/global nav once the shell is mounted.
- The fix is to make the cached home fallback render feed content placeholders only, not another nav bar.

## Verification

After implementation, reload `/app` in desktop preview and confirm:
- only one loader sequence appears
- no second bar flashes under the main nav
- no layout jump between boot skeleton and mounted app shell
- side panels remain visually stable during the handoff