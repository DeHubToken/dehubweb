
Goal: stop the mobile screen from changing before the post drawer appears, and make open/close feel like one smooth overlay instead of a route flash.

What’s actually wrong
- The app is still switching into “dedicated post page” mode the moment the URL changes.
- That means the mobile header disappears and the main container padding changes before the mobile post sheet is visually in place.
- On top of that, `SinglePostPage` intentionally mounts the drawer closed first and opens it on the next frame, which creates a visible intermediate state.
- So even though the feed is being kept mounted, the underlying screen chrome is still changing first.

Plan
1. Make feed-to-post overlay navigation explicit
- Pass route state when opening a post from feed cards, e.g. “open as mobile overlay” plus the background route.
- This removes the fragile guesswork based on previous pathname/session storage and makes the overlay decision deterministic on the very first render.

2. Keep the underlying feed screen visually frozen during overlay mode
- In `AppLayout`, stop using raw `isPostRoute` to change layout chrome during feed-overlay opens.
- When the route was opened as an overlay:
  - keep the mobile header behavior of the feed screen underneath
  - keep the main content spacing as-is underneath
  - keep the persisted home/feed page visible exactly as it was

3. Replace the mobile post Vaul entry behavior with an immediate full-screen overlay
- In `SinglePostPage`, remove the “mount closed, open on rAF” behavior for feed-overlay opens.
- Use an always-mounted full-screen mobile overlay container for this route so it appears immediately and only animates the sheet itself.
- No top handle, no overlay dimmer, no border/shadow edge, no outside line.

4. Make close animation smooth and controlled
- On close, animate the overlay down first, then navigate back after the transition finishes.
- Preserve the existing feed scroll position behind it so closing feels like returning to the same screen, not reloading it.

5. Keep direct deep links working normally
- If someone lands directly on `/app/post/:id` or `/app/video/:id`, keep the normal dedicated page behavior.
- Only feed-origin opens should use the “overlay over unchanged background” path.

Files to update
- `src/pages/app/SinglePostPage.tsx`
- `src/components/app/AppLayout.tsx`
- `src/components/app/navigation/MobileHeader.tsx`
- Post openers that navigate into single post routes, especially:
  - `src/components/app/cards/PostCard.tsx`
  - `src/components/app/cards/VideoCard.tsx`
  - `src/components/app/cards/ImageCard.tsx`
  - `src/components/app/cards/LiveCard.tsx`
  - any other feed card components that should open as overlay

Technical details
- Root cause is not just the drawer itself; it is the combination of:
  - route-based layout changes in `AppLayout`
  - `MobileHeader` auto-hiding on `/app/post/*`
  - delayed drawer open in `SinglePostPage`
- I would keep the existing persisted-feed idea, but change the trigger from inferred state to explicit navigation state, then decouple mobile overlay rendering from Vaul’s initial closed-frame behavior for this one route.

Expected result
- Tap post from feed: background stays exactly as-is, drawer appears immediately from the bottom/top edge as a true fullscreen sheet.
- Close drawer: smooth slide back to the same feed position, no flash, no black pre-state, no weird outside line.
- Direct-link post visit still works as a normal page.

No backend or database changes are needed.
