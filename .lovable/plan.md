

## Fix Side Panel Icon Re-rendering

### Problem
The `SidebarLeaderboard` component uses Framer Motion's `AnimatePresence` with `key={activePeriod}`, which completely unmounts and remounts the entire leaderboard list every time the period changes (every 5 seconds via auto-rotate, or on manual selection). This destroys all `<img>` DOM elements (medals, avatars, badges) and creates fresh ones, causing a visible flash/re-render even though the image files are browser-cached.

### Solution
Replace the `AnimatePresence` destroy-and-recreate pattern with a **CSS-based visibility toggle** (matching the profile tab pattern already used in the app). All period lists will remain mounted in the DOM, with inactive ones hidden via `visibility: hidden` + `height: 0`. This keeps images in the render tree and eliminates the flash.

### Changes

**File: `src/components/app/sidebar/SidebarLeaderboard.tsx`**

1. Remove the `AnimatePresence` and `motion.div` wrapper around the leaderboard entries
2. Pre-fetch all period data by rendering a hidden container for each period
3. Use CSS visibility toggling (`visibility: hidden`, `height: 0`, `position: absolute`) for inactive periods, and normal flow for the active one -- matching the existing native-tab-stability pattern
4. Keep the fade-in animation as a simple CSS `animate-fade-in` class on the active period
5. The auto-rotate and manual period selection logic stays the same, only the rendering strategy changes

### Technical Details

- Remove `framer-motion` imports (`AnimatePresence`, `motion`) from SidebarLeaderboard
- Remove `directionRef` (no longer needed for directional animation)
- Remove `shimmerKey` state (medal shimmer can re-trigger via CSS class toggle on period change)
- Render all 5 periods simultaneously inside the scrollable area, each wrapped in a `div` that toggles visibility based on `activePeriod`
- Each period container uses the existing query `['sidebar-leaderboard', 'holdings', apiPeriod]` -- TanStack Query will deduplicate and cache these
- Active period: `className="h-full animate-fade-in"`
- Inactive periods: `className="h-0 overflow-hidden invisible absolute"`
- This matches the proven pattern from the profile tabs (StableHeightContainer approach)

### What Won't Change
- Tab switching between Leaderboard/Follow/Chat (already uses `display: none` correctly)
- Badge and medal images (already local imports, will stay cached in DOM)
- Auto-rotation timing and period selection logic
- Query caching and data fetching behavior

