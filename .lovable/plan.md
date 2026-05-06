## What’s actually wrong
- The red announcement banner is being rendered by **two different systems**:
  - raw boot HTML in `index.html`
  - React `UpgradeNoticeBanner` in `src/components/app/UpgradeNoticeBanner.tsx`
- The React banner starts with `visible = false` and only turns on in `useEffect`, so after the first HTML paint it briefly disappears, then comes back.
- There is still another full-shell loader in React:
  - `src/App.tsx` uses `WalletLoader` / `PageLoader` → `HomeShellSkeleton`
- The first HTML shell and the React `HomeShellSkeleton` are **not the same geometry**, so the app visually goes:
  - boot shell
  - differently sized React shell
  - real content

## Plan
1. **Stop the banner disappearing during handoff**
   - Make the React banner use a synchronous initial visibility check so it does not mount hidden and then reappear.
   - Ensure the boot banner and app banner share the same visibility rules so hydration doesn’t cause a flash.

2. **Remove the second full-page shell on initial `/app` boot**
   - Update `src/App.tsx` so the initial `/app` startup does not swap from the HTML boot shell into a second React shell.
   - Keep route-level lazy fallbacks for non-home routes, but stop using a competing home-shell fallback during the first app boot.

3. **Unify the shell sizing so there is only one visual loader**
   - Either make the HTML boot shell match the React home shell exactly, or make the React path defer to the existing HTML shell instead of repainting a different one.
   - This specifically targets the center column size mismatch you called out.

4. **Verify the full sequence properly**
   - Hard reload `/app` in preview.
   - Watch the actual load path from first paint through real content.
   - Confirm the sequence is only:
     - banner + boot shell
     - real content
   - Confirm there is no banner drop/reappear and no intermediate “correct-sized” second skeleton.

## Files involved
- `index.html`
- `src/App.tsx`
- `src/components/app/UpgradeNoticeBanner.tsx`
- `src/components/app/PageSkeletons.tsx`
- `src/components/app/feeds/HomeFeed.tsx`