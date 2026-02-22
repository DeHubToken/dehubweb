

# Fix Smooth Scroll Bounce Clipping on All Feed Sort Menus

## Problem

The animated "liquid glass" filter pills use `framer-motion` layoutId animations with shadows and borders that extend slightly outside their container. The parent `motion.div` (the collapsible filter panel) uses `overflow-hidden` which clips these visual effects -- especially visible when scrolling to the far left where the bounce/elastic effect pushes content past the container edge.

This was already fixed in MusicFeed by using `overflow-y-clip overflow-x-visible` instead of `overflow-hidden`. The same fix needs to be applied to HomeFeed, VideosFeed, ShortsFeed, and ImagesFeed.

## Changes

### 1. HomeFeed.tsx (line ~1072)

Change the `motion.div` wrapper class from:
```
className="overflow-hidden"
```
to:
```
className="overflow-y-clip overflow-x-visible"
```

### 2. VideosFeed.tsx (line ~715)

Same change on the `motion.div` wrapper:
```
className="overflow-hidden"  ->  className="overflow-y-clip overflow-x-visible"
```

### 3. ShortsFeed.tsx (line ~505)

Same change:
```
className="overflow-hidden"  ->  className="overflow-y-clip overflow-x-visible"
```

### 4. ImagesFeed.tsx (line ~476)

Same change:
```
className="overflow-hidden"  ->  className="overflow-y-clip overflow-x-visible"
```

### 5. Add `overflow-y-visible` to pill scroll rows (all 4 feeds)

Each `div` containing the `AnimatedFilterPill` buttons (the ones with `flex gap-1.5 overflow-x-auto scrollbar-hide`) should also get `overflow-y-visible` added, matching MusicFeed's pattern. This ensures the pill shadows render fully above and below the scroll row.

## Why this works

- `overflow-y-clip` still clips vertical overflow so the AnimatePresence height animation (expand/collapse) works correctly
- `overflow-x-visible` allows the horizontal bounce/elastic scroll effect to render without clipping the glass pill shadows at the edges
- `overflow-y-visible` on the inner scroll row lets pill borders/shadows render above and below the row

## Feeds NOT affected

- LiveFeed and PPVFeed do not use AnimatedFilterPill sort menus, so no changes needed
- MusicFeed already has the fix applied

