

# Fix: Standardize Assistant Text Size in Sidebar

## Problem
The "Assistant" menu item uses `text-[13.5px]` while all other sidebar navigation items use `text-[15px]`, creating an inconsistent appearance.

## Root Cause
The Assistant link is rendered directly in `DesktopSidebar.tsx` instead of using the shared `SidebarNavItem` component, and it was given a smaller font size.

---

## Solution

### File: `src/components/app/navigation/DesktopSidebar.tsx`

Change the Assistant NavLink text size from `13.5px` to `15px` to match all other navigation items.

**Line 111 - Update text size:**
```tsx
// Before
className={cn(
  'flex items-center gap-3 w-full px-2.5 py-2.5 rounded-xl text-left transition-colors text-[13.5px]',
  ...
)}

// After  
className={cn(
  'flex items-center gap-3 w-full px-2.5 py-2.5 rounded-xl text-left transition-colors text-[15px]',
  ...
)}
```

---

## Summary

| Item | Current Size | After Fix |
|------|--------------|-----------|
| Profile | 15px | 15px |
| Explore | 15px | 15px |
| Notifications | 15px | 15px |
| Messages | 15px | 15px |
| **Assistant** | **13.5px** | **15px** |
| Leaderboard | 15px | 15px |
| Bookmarks | 15px | 15px |
| Settings | 15px | 15px |
| Blog | 15px | 15px |

This is a one-line fix that ensures visual consistency across all sidebar navigation items.

