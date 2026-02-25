

## Collapsible Sidebar with 2-Column Feed

### What Changes

**1. Sidebar collapse state** -- needs to be shared across components so that `DesktopSidebar`, `AppLayout`, and `HomeFeed` all react to it.

**2. DesktopSidebar (`src/components/app/navigation/DesktopSidebar.tsx`)**
- Add a hamburger menu button (Menu icon from lucide) to the left of the DeHub logo
- Shift logo slightly right to accommodate the button
- When clicked, toggles a `collapsed` state
- When collapsed: sidebar shrinks to `w-[60px]` (already the non-xl width), hides text labels, shows only icons -- essentially forces the compact mode at all screen sizes

**3. AppLayout (`src/components/app/AppLayout.tsx`)**
- Lift sidebar collapsed state here (or use a context/provider) so both `DesktopSidebar` and the feed can access it
- When sidebar is collapsed, the `main` area gets more horizontal space
- Right sidebar stays unchanged

**4. HomeFeed (`src/components/app/feeds/HomeFeed.tsx`)**
- When sidebar is collapsed, the feed container switches from `space-y-3` (single column) to a CSS grid: `grid grid-cols-2 gap-3`
- Each post card rendered inside the grid will naturally size to half-width
- The bento wrapper in `renderFeedItem` (line 827) stays the same -- it just flows into the grid
- Shorts carousels and other full-width inserts span both columns (`col-span-2`)

### Technical Details

**State management**: Create a simple React context `SidebarCollapseContext` (new file `src/contexts/SidebarCollapseContext.tsx`) that exposes `{ isCollapsed, toggleCollapse }`. Wrap it in `AppLayout`. This avoids prop drilling through multiple layers.

**DesktopSidebar changes**:
- The aside currently uses `w-[60px] xl:w-[231px]`. When collapsed, force `w-[60px]` regardless of breakpoint
- Add `<Menu />` icon button in the logo row, visible only at `xl:` (when full sidebar is shown -- at smaller sizes it's already compact)
- When collapsed, hide all text labels (same as current non-xl behavior)

**HomeFeed changes**:
- Consume `SidebarCollapseContext`
- The feed items container (line 1035) changes from `space-y-3` to `grid grid-cols-2 gap-3` when collapsed
- Full-width elements (shorts carousel, radio carousel, who-to-follow) get `col-span-2`
- Individual post/video/image cards naturally fill one grid cell each

**Files to create**:
- `src/contexts/SidebarCollapseContext.tsx` -- context + provider

**Files to modify**:
- `src/components/app/AppLayout.tsx` -- wrap with SidebarCollapseProvider, pass state
- `src/components/app/navigation/DesktopSidebar.tsx` -- add burger button, consume context for collapse
- `src/components/app/feeds/HomeFeed.tsx` -- consume context, switch to grid layout when collapsed

### Visual Result

```text
EXPANDED (current):                    COLLAPSED (new):
┌──────────┬────────────┬─────┐       ┌───┬──────────────────────┬─────┐
│ ☰ DEHUB  │  Feed      │Right│       │ ☰ │  Feed (2-col grid)   │Right│
│ Profile  │  [Post 1]  │ Bar │       │ 🏠│  [Post1]  [Post2]    │ Bar │
│ Explore  │  [Post 2]  │     │       │ 🔍│  [Post3]  [Post4]    │     │
│ Notifs   │  [Post 3]  │     │       │ 🔔│  [Post5]  [Post6]    │     │
│ Messages │  ...       │     │       │ 💬│  ...                 │     │
│ ...      │            │     │       │   │                      │     │
└──────────┴────────────┴─────┘       └───┴──────────────────────┴─────┘
```

The burger icon is always visible in the top-left of the sidebar (next to the logo). Clicking it toggles between the two states. The collapsed state persists in `localStorage` so it remembers user preference.

