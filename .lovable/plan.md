

## Plan: Normalize spacing between icon tabs and period bar in sidebar bentos

### Problem
The top-right bento (Leaderboard) has ~20px between the icon tab row and the 1D/1W/1M period selector, while the bottom-right bento (What's Happening) has ~12px. The top is more spaced out.

### Fix
Reduce the top-right bento's period bar top padding from `py-2` to `py-1` in `SidebarLeaderboard.tsx` (line 255), changing the period filter row class from `px-4 py-2` to `px-4 py-1`. This brings the gap down from 20px to ~16px, closer to the bottom bento's spacing.

Alternatively, if you want them perfectly matched, remove the `py-2` entirely and use `px-4 pt-0 pb-1`.

### File
- `src/components/app/sidebar/SidebarLeaderboard.tsx` — line 255: change period row padding

