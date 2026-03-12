

# Fix actors drawer: show all likers + prevent navigation on drawer close

## Two Issues

### Issue 1: "and 4 others" but drawer only shows 3 people
The API's `latestActorNames` array only contains ~3 names even when `aggregatedCount` is higher (e.g. 5). The actors drawer renders `canonicalActors` which is built from `latestActorNames`, so it can never show more than what the API provides.

**Fix**: Since there's no dedicated "get likers" endpoint, we show all available actors in the drawer and add a note at the bottom when `aggregatedCount` exceeds the number of names we have, e.g. "and 2 more". The "and N others" text in the notification will also be corrected to reflect the actual number of *additional* actors beyond the first displayed name (based on `aggregatedCount - 1`), not based on `canonicalActors.length - 1`.

### Issue 2: Closing the actors drawer triggers navigation
When the drawer closes, the click event bubbles up to the parent `<div onClick={handleClick}>`. The `showActorsDrawer` state is already `false` by the time `handleClick` runs (React batches the state update from `onOpenChange`), so the guard `if (showActorsDrawer) return;` doesn't catch it.

**Fix**: Add a `drawerJustClosed` ref. When either drawer's `onOpenChange` fires with `false`, set the ref to `true` and clear it after a short timeout (~300ms). In `handleClick`, if `drawerJustClosed.current` is true, bail out.

## Changes (single file: `NotificationsPage.tsx`)

1. **Add `drawerJustClosed` ref** in `NotificationItem` component, set it on drawer close, check it in `handleClick`.

2. **Update drawer `onOpenChange` handlers** for both actors and posts drawers to set the ref when closing.

3. **Add "and N more" footer** in the actors drawer when `aggregatedCount` exceeds `canonicalActors.length`.

4. **Fix "others" count** in notification text to use `aggregatedCount - 1` instead of `canonicalActors.length - 1`, so the text accurately reflects the total.

