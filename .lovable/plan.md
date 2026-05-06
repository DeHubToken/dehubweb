## Goal
Make `/app` use one visually continuous preloader with no apparent second loading event.

## What is causing it
Two separate things are still making the load feel like two preloaders:

1. **Shell mismatch:** the boot/app shell skeleton does not match the real left/right panel geometry closely enough.
   - Left sidebar skeleton uses a static `w-[231px] px-[18px]` layout, but the real `DesktopSidebar` has different padding, top offsets, negative margin, collapsed/expanded behaviors, and inner spacing.
   - Right sidebar skeleton also uses simplified spacing that does not match `RightSidebar`, `TabbedSidePanel`, and `WhatsHappening` heights/margins.
   - So when the real side panels mount, the layout visibly “changes” before the feed finishes.

2. **Late feed fallback:** `HomeFeed` still has its own full `FeedBodySkeleton` branch when query data is not ready.
   - That means the app shell hands off to a second content-phase placeholder in the center column.
   - Even without a duplicated nav bar, it still reads as a second preloader event.

## Plan
1. **Make the home shell skeleton match the live desktop shell exactly**
   - Update `HomeLeftSidebarSkeleton` and `HomeRightSidebarSkeleton` in `src/components/app/PageSkeletons.tsx` to mirror the real widths, padding, margins, sticky behavior, and panel heights used by `DesktopSidebar` and `RightSidebar`.
   - Sync the boot HTML skeleton in `index.html` to the same geometry so first paint and React fallback are identical.

2. **Stop `HomeFeed` from owning a second full loading phase**
   - Replace the current `FeedBodySkeleton` usage in `src/components/app/feeds/HomeFeed.tsx` with a non-jumping strategy that preserves the mounted shell and existing panel dimensions.
   - Keep already-mounted chrome stable and only show inline loading where needed instead of swapping the feed body back to a fresh placeholder layout.

3. **Align the home column container dimensions across all three stages**
   - Ensure the sizing/spacing chain is identical across:
     - `index.html` boot skeleton
     - `HomeShellSkeleton` / `PersistentPageCache` Suspense fallback
     - real `HomePage` + `HomeFeed`
   - This includes the sticky tab bar wrapper, center column padding, and first-card offsets.

4. **Verify the handoff visually on `/app`**
   - Check the transition from boot skeleton → shell mount → home data render at desktop viewport.
   - Confirm:
     - nav skeleton stays present until the real nav replaces it
     - side panels do not resize during handoff
     - the center feed does not re-enter a second skeleton phase
     - the final state is one continuous loader only

## Files to update
- `src/components/app/PageSkeletons.tsx`
- `src/components/app/feeds/HomeFeed.tsx`
- `index.html`

## Technical notes
- I will use the existing real components as the source of truth for dimensions, not approximate them.
- I will keep this scoped to the preloader chain only — no unrelated UI changes.