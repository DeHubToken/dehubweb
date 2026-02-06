

# Make Sort/Filter Menus Horizontally Scrollable

## Problem
The sort and filter pill menus (Sort, Upload Date, Duration, Post Type, Content Access, Content Type) currently use `flex-wrap`, which causes them to break into two rows on smaller screens. This looks crowded and inconsistent with the rest of the app's horizontal scroll patterns.

## Solution
Replace `flex-wrap` with horizontal scrolling (`overflow-x-auto`) on all filter pill rows across every feed. This matches the existing pattern used by Radio genre filters and TV category filters. A right-side fade gradient will hint that more options exist off-screen.

## Files to Update

Four feed files contain filter sections that need this change:

1. **HomeFeed.tsx** -- 4 filter rows: Sort, Upload Date, Post Type, Content Access
2. **VideosFeed.tsx** -- 4 filter rows: Sort, Duration, Upload Date, Content Type
3. **ImagesFeed.tsx** -- 3 filter rows: Sort, Upload Date, Content Type
4. **ShortsFeed.tsx** -- 3 filter rows: Sort, Duration, Upload Date

## Technical Details

For each filter row, the change is the same pattern:

**Before:**
```
<div class="flex gap-1.5 flex-wrap">
  {buttons}
</div>
```

**After:**
```
<div class="relative">
  <div class="flex gap-1.5 overflow-x-auto scrollbar-hide whitespace-nowrap pr-6">
    {buttons with flex-shrink-0}
  </div>
  <div class="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-zinc-900 to-transparent pointer-events-none" />
</div>
```

- Each button gets `flex-shrink-0` so it doesn't compress
- `scrollbar-hide` keeps it clean (already used elsewhere in the app)
- A subtle fade on the right edge signals scrollability
- The gradient fades from `zinc-900` to match the filter panel background

This is a purely visual/layout change with no logic or data changes.

