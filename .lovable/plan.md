

## Fix: Explore Page Category Pills Not Swipeable

### Problem
The category pills on the Explore page (line 1032 of `ExplorePage.tsx`) use a plain `<div>` with `overflow-x-auto` and `touchAction: 'pan-x'`. This doesn't provide proper swipe/drag behavior on mobile or trackpad, unlike every other carousel in the app which uses `SwipeableCarousel`.

### Fix
**`src/pages/app/ExplorePage.tsx` (line 1032):**
- Wrap the category buttons `div` with `<SwipeableCarousel>`, matching the pattern used in `TVCategoryFilter`, `VideosFeed`, etc.
- Import `SwipeableCarousel` if not already imported.
- Remove the inline `style={{ touchAction: 'pan-x' }}` since `SwipeableCarousel` handles touch gestures internally.

Single-line change — this is a 2-minute fix.

