
## Analysis: Why the Collapse/Expand Animation Feels Rigid

After inspecting the codebase and profiling the transition, the root cause is **multiple independent CSS transitions fighting each other at different timings**, plus **layout reflows from content changes** that happen mid-animation.

### The specific problems

1. **`max-width` transition on the outer container** (AppLayout line 171-172): Animating `max-width` from `80rem` to `100%` causes the browser to recalculate layout for the entire page on every frame. With 17,000+ DOM nodes and a masonry grid that re-columns based on `isCollapsed`, this is extremely expensive.

2. **Feed grid instantly jumps from 1-column to 3-column masonry** (HomeFeed line 872-885): The `colCount` state changes synchronously with `isCollapsed`, so mid-animation the entire feed snaps from single-column to multi-column layout. This creates the visible "multi-step" jank.

3. **GlobalFeedNav animating `max-height` + `opacity` + `transform`** simultaneously while the container is also changing width creates compounding layout shifts.

4. **Right sidebar padding transition** adds yet another element reflowing during the same 500ms window.

5. **`transition-[width,padding]` on the left sidebar** is correct but fights with the `max-width` transition on the parent container.

### The fix: Defer content layout changes until after the animation

The core principle is: **animate the shell (widths, padding) smoothly, and only swap feed columns after the animation settles.**

#### Changes

**1. `src/components/app/AppLayout.tsx`** (2 changes)
- Replace `transition-[max-width]` with a simpler approach: use `will-change: max-width` and keep the 500ms ease-in-out but add `transform: translateZ(0)` to promote compositing
- For the `GlobalFeedNav` wrapper, simplify to just `opacity` and `transform` transitions (remove `max-height` which triggers layout). Use a fixed height with `overflow: hidden` and toggle between `h-12` and `h-0`

**2. `src/components/app/feeds/HomeFeed.tsx`** (1 change, lines 872-885)
- Delay the `colCount` update by 500ms after `isCollapsed` changes, so the masonry grid doesn't re-column during the width animation. Use `setTimeout` gated by a `useRef` to debounce.

**3. `src/components/app/navigation/DesktopSidebar.tsx`** (1 change)
- Add `will-change: width` to hint the browser to optimize the sidebar width transition

**4. `src/components/app/RightSidebar.tsx`** (1 change)
- Add `will-change: padding` to the aside element

### Technical detail

The key insight is that `max-width: 80rem -> 100%` on a flex container with 17K DOM nodes forces a full layout recalculation on every animation frame. By deferring the masonry column change until the width animation finishes, we eliminate the worst source of jank: the entire feed restructuring mid-transition. The shell (sidebar widths, container max-width, nav bar) can animate smoothly because those are relatively cheap layout changes when the content inside doesn't simultaneously restructure.

The `will-change` hints tell the browser to prepare compositor layers ahead of time, reducing paint thrashing during the transition.
