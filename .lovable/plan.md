
# Fix Sidebar Leaderboard to Match Main Leaderboard Page

## Problem
The sidebar leaderboard (`SidebarLeaderboard.tsx`) always displays `entry.total` (the all-time DHB balance) regardless of which time period is selected. The main leaderboard page correctly shows `entry.delta` (the growth amount) when a time-based period (1d, 1w, 1m, 1y) is selected.

For example, @aaron shows "+5M" on the main page (correct delta) but "29M" in the sidebar (total balance, not delta).

## Fix

**File: `src/components/app/sidebar/SidebarLeaderboard.tsx`**

1. Update the value display logic (line 227) to check the active period and show the delta when viewing a time-based period, matching the main leaderboard's behavior:
   - If the period is **not** "All", display `entry.delta` with a "+" prefix (e.g., "+5.2M DHB")
   - If the period **is** "All", display `entry.total` as it does now (e.g., "29.3M DHB")
   - Handle cases where `delta` is 0 or undefined gracefully (show "0 DHB" or skip)

2. Add a helper or inline logic similar to the main page's `getSortValue` / `formatDisplayValue` pattern.

## Technical Details

The change is isolated to one section in `SidebarLeaderboard.tsx`:

```tsx
// Line 226-228: Current (broken)
<span className="text-zinc-400 text-xs">{formatDHB(entry.total ?? 0)}</span>

// Fixed: show delta for time-based periods
const isTimeDelta = activePeriod !== 'All';
const displayValue = isTimeDelta && entry.delta !== undefined ? entry.delta : (entry.total ?? 0);
const prefix = isTimeDelta && entry.delta !== undefined && entry.delta > 0 ? '+' : '';
// Then render:
<span className="text-zinc-400 text-xs">{prefix}{formatDHB(displayValue)}</span>
```

This ensures the sidebar and main leaderboard page show identical values for the same time period.
