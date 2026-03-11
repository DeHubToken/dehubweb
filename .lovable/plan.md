

## Fix: Seamless Tab Switching Between Topics and Tickers

**Problem**: `AnimatePresence mode="wait"` causes the exiting tab to animate out before the entering tab animates in, creating a visible flash/collapse that shifts scroll position.

**Fix** (single file — `src/components/app/WhatsHappening.tsx`):

1. **Remove `AnimatePresence`** entirely — it's the source of the mount/unmount cycle that causes layout shifts.

2. **Render both tabs simultaneously**, using CSS to show/hide:
   - Both `posts` and `tickers` content stay mounted at all times
   - Use `opacity` + `pointer-events` to toggle visibility with a quick CSS transition
   - This means no DOM unmounting, no height collapse, no scroll jump

3. **Keep the fixed `minHeight: 280`** container as-is for safety.

The key change: replace the conditional rendering (`activeTab === 'posts' && ...`) with always-rendered divs that toggle `opacity-0 pointer-events-none absolute` vs `opacity-100 relative`, using a `position: relative` wrapper so both tabs occupy the same space.

