# Fix first-load home preloader so it matches the real app shell

## What I’ll change

1. Replace the current boot HTML skeleton in `index.html` with a full home-shell skeleton instead of a generic feed card stack.
   - Desktop: left nav shell, center home feed area, right sidebar panels.
   - Mobile: top app header spacing, home tabs, story/friends strip, mixed feed blocks.
   - Keep the same liquid-glass look and white-opacity styling already used in the app.

2. Refactor `src/components/app/PageSkeletons.tsx` so the home loader is split into reusable pieces.
   - Create a dedicated shell-aware home skeleton rather than a single center-column placeholder.
   - Reuse the same markup pattern for the boot loader and React loader so there’s no visual handoff flash.
   - Remove any leftover old “stories-era / giant post card” structure from the home preload path.

3. Update `src/App.tsx` so the first React fallback uses the same shell-aware home skeleton.
   - This keeps the sequence consistent from:
     `HTML boot skeleton -> wallet/page suspense -> cached home page load -> real home content`
   - The dedicated post pages and other routes will keep their existing route loaders unless they are directly affected by the home boot path.

4. If needed, align the home cached-page fallback path in `src/components/app/PersistentPageCache.tsx` with the new loader component so the home route never falls back to an outdated skeleton variant.

## Result

- First load on `/app` will look like your actual app layout, not one giant fake post.
- Desktop will show panel structure instead of a stretched center card.
- Mobile will still look like the real home feed, with no old skeleton flashes.
- Old preload skeleton variants in the home boot path will be removed so there’s only one current style.

## Technical details

Files likely involved:
- `index.html`
- `src/components/app/PageSkeletons.tsx`
- `src/App.tsx`
- possibly `src/components/app/PersistentPageCache.tsx`

Implementation notes:
- I’ll preserve the existing Safari-safe / low-motion constraints.
- I’ll keep styling aligned with your current semantic/glass system and avoid reintroducing blue or old card shapes.
- After implementation, I’ll verify the initial desktop viewport render specifically, since that’s where the current mismatch is most obvious.