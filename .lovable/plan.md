

## Plan: Keep Left Sidebar Expanded Longer — Feed Shrinks First

### Problem
Currently, the left sidebar collapses to icon-only at the `xl` breakpoint (1280px), meaning as soon as the viewport drops below 1280px the sidebar loses its labels while the feed stays large. The user wants the opposite priority: the feed should compress first, and the sidebar should remain fully expanded down to the `lg` breakpoint (1024px).

### Approach
Change all `xl:` responsive classes that control the sidebar's expanded state to `lg:` instead. Since the sidebar and feed are in a flex layout, the feed (`flex-1`) will naturally shrink as the sidebar takes more space. No changes to collapsed/fullscreen mode.

### Files to Change

**1. `src/components/app/navigation/DesktopSidebar.tsx`**
- Line 95: Change `xl:w-[231px] xl:px-[18px] xl:items-stretch xl:pt-0 xl:-mt-[3px]` → use `lg:` prefix instead of `xl:`
- All other `xl:` prefixes controlling expanded-state visibility (logo, menu toggle, labels, coin balance, buttons) — approximately 15 occurrences — change from `xl:` to `lg:`
- This keeps the sidebar at 231px from 1024px upward in normal mode

**2. `src/components/app/navigation/SidebarNavItem.tsx`**
- Lines 72, 74, 104, 147: Change `xl:` responsive classes to `lg:` so nav item labels and layout respond at the same breakpoint as the sidebar container

**3. `src/components/app/RightSidebar.tsx`**
- Optionally reduce right sidebar width slightly at the old `lg` range (e.g., `lg:w-72 xl:w-80`) to give more room to the feed at narrower widths

### What Won't Change
- Collapsed/fullscreen mode (`isCollapsed` state) — untouched, all those code paths use the `isCollapsed` conditional, not the breakpoint
- Mobile layout — unchanged (below `lg`)
- The sidebar still collapses to 60px icons when user manually clicks the collapse toggle

### Result
At 1024–1280px the user will see: full expanded sidebar (231px) + right sidebar (320px) + a narrower feed in the middle — instead of the current icon-only sidebar with an oversized feed.

