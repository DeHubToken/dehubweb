
## Fix: Filter Menus Breaking on Rapid Toggle

### Root Cause

Every feed tab (Home, Videos, Shorts, Images, Music) wraps its filter section in `AnimatePresence` with a conditional `motion.div` that animates `height: 0` to `height: auto`. When you rapidly toggle filters (by tapping the same tab twice quickly), Framer Motion's `AnimatePresence` hits a race condition: the exit animation hasn't completed when a new enter animation starts. This leaves the `motion.div` stuck at `height: 0` with `overflow-hidden`, making the filters invisible even though `showFilters` is `true`.

### Solution

Add `mode="wait"` to every `AnimatePresence` wrapper around filter sections. This tells Framer Motion to finish the exit animation before starting the enter animation, preventing the race condition.

### Files to Change

1. **src/components/app/feeds/HomeFeed.tsx** (line ~1065)
   - Change `<AnimatePresence>` to `<AnimatePresence mode="wait">`

2. **src/components/app/feeds/VideosFeed.tsx** (line ~708)
   - Change `<AnimatePresence>` to `<AnimatePresence mode="wait">`

3. **src/components/app/feeds/ShortsFeed.tsx** (line ~498)
   - Change `<AnimatePresence>` to `<AnimatePresence mode="wait">`

4. **src/components/app/feeds/ImagesFeed.tsx** (line ~469)
   - Change `<AnimatePresence>` to `<AnimatePresence mode="wait">`

5. **src/components/app/feeds/MusicFeed.tsx** (line ~662)
   - Change `<AnimatePresence>` to `<AnimatePresence mode="wait">`

### What This Fixes

- Filters will no longer get stuck in a collapsed/invisible state after rapid toggling
- The exit animation completes cleanly before the enter animation begins
- No visual change to the animation itself -- same smooth height transition
