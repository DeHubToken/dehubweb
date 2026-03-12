
You’re right — I found why this still happens.

## Root cause
The UI is deciding the avatar layout from the **primary raw notification’s backend aggregation fields** (`aggregatedCount`, `latestActorNames`), but the text is coming from the **client-side same-actor bundle** (`bundleType === 'same-actor'`, `postCount=2`).

So in mixed cases, it can render:
- text: `kwame1 liked 2 of your posts` (same-actor bundle)
- avatar: 2x2 grid (because primary notification still has multi-actor metadata)

That mismatch is exactly what your screenshot shows.

## Implementation plan
1. **Unify “display mode” decision in `NotificationItem`**
   - Compute one boolean (e.g. `shouldShowActorGrid`) that includes:
     - notification type supports grid
     - `aggregatedCount > 2`
     - `uniqueActorCount >= 2`
     - **AND NOT** `bundle.bundleType === 'same-actor'`
2. **Use that same boolean everywhere**
   - Grid rendering branch
   - Type-icon overlay visibility (currently separately hidden by raw aggregated fields)
   - Any “open actors drawer” affordance tied to grid mode
3. **Keep same-actor bundle visually single-actor**
   - If bundled as same-actor, force single avatar + normal badge.
   - Keep text as “X liked N of your posts”.
4. **Add a defensive bundling guard (optional but recommended)**
   - In `bundleNotifications`, do not merge a backend multi-actor aggregated row into same-actor bundles.
   - This prevents future mixed-state regressions.

## Technical details
```text
Current mismatch:
  content source -> bundle.bundleType
  avatar source  -> notification.aggregatedCount/latestActorNames

Target:
  content + avatar + icon visibility
  all driven by one derived mode:
    same-actor bundle  => single avatar mode
    true multi-actor   => 2x2 grid mode
```

## Validation checklist after fix
1. **One user / multiple posts** → single avatar, no 2x2 grid, text “liked N of your posts”.
2. **Multiple users / one post** → 2x2 grid appears correctly.
3. **Grid fallback slot click** still opens correct user (or fallback with no wrong profile jump).
4. **“N others” click** still opens actors drawer.
