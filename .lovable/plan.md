

## Improve Badge Visibility on Truncated Usernames (Sidebar Leaderboard)

### Problem
When a display name is long enough to truncate in the sidebar panel (e.g., "MIKE HA..."), the staking badge can appear cramped or visually lost next to the ellipsis.

### Solution
Ensure the display name flex row properly shrinks the name text while always reserving space for the badge icon.

### Changes

**File: `src/components/app/sidebar/SidebarLeaderboard.tsx`**

1. Add `min-w-0` to the name+badge flex container (line 218) so it respects the parent's width constraint and allows proper truncation.
2. Wrap the display name `span` in a flex-shrink container so the badge icon (`flex-shrink-0`) always remains fully visible regardless of name length.

```text
Before:
  <div className="flex items-center gap-1">
    <span className="font-semibold text-white text-sm truncate">...</span>
    <img ... className="w-3 h-3 flex-shrink-0 -mt-1" />
  </div>

After:
  <div className="flex items-center gap-1 min-w-0">
    <span className="font-semibold text-white text-sm truncate min-w-0 flex-1">...</span>
    <img ... className="w-3 h-3 flex-shrink-0 -mt-1" />
  </div>
```

The key additions:
- `min-w-0` on the flex row -- allows the flex container itself to shrink below its content size
- `min-w-0 flex-1` on the name span -- ensures truncation kicks in properly while the badge keeps its full width

This is a minimal, targeted CSS fix with no behavioral changes.

