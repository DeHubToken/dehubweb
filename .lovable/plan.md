

# Leaderboard: Show Negative Deltas + Sort Direction Toggle

## Current Behavior
- Time-based periods (Day/Week/Month/Year) only display positive deltas with a "+" prefix
- Negative deltas are shown as plain numbers without a "-" prefix or red styling
- There is no way to flip sort order -- the list is always descending (highest first)

## Changes

### 1. Show Negative Deltas Properly
- Update `formatDisplayValue` to display negative deltas with a "-" prefix and red text color
- Ensure entries with negative deltas are not hidden -- they should appear in the list

### 2. Add Sort Direction Toggle
- Add a new state `sortDirection` (`'desc' | 'asc'`) defaulting to `'desc'`
- Add a small toggle button (arrow icon) next to the time period tabs or the column header
- When toggled to ascending, reverse the `entries` array so losers appear at the top
- This is especially useful for time-based periods to see who lost the most

### 3. Style Negative vs Positive
- Positive deltas: green text with "+" prefix (currently white with "+")
- Negative deltas: red text with "-" prefix
- Zero/neutral: default white text

## Technical Details

### File: `src/pages/app/LeaderboardPage.tsx`

**New state:**
```typescript
const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
```

**Updated `entries` memo** -- add a sort step at the end:
```typescript
// After filtering, sort by the current sort direction
list = [...list].sort((a, b) => {
  const aVal = getSortValue(a);
  const bVal = getSortValue(b);
  return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
});
```

**Updated `formatDisplayValue`** -- handle negatives:
```typescript
if (isTimeDelta && hasHistoricalData && entry.delta !== undefined && entry.delta !== 0) {
  const prefix = value > 0 ? '+' : ''; // negative numbers already have "-"
  if (category === 'holdings' || category === 'sentTips' || category === 'receivedTips') {
    return `${prefix}${formatNumber(value)} DHB`;
  }
  return `${prefix}${formatNumber(value)}`;
}
```

**Updated value display** -- add color based on delta sign:
```tsx
<div className={cn(
  "col-span-3 sm:col-span-6 text-right font-medium",
  isTimeDelta && entry.delta !== undefined && entry.delta > 0 && "text-green-400",
  isTimeDelta && entry.delta !== undefined && entry.delta < 0 && "text-red-400",
  !(isTimeDelta && entry.delta !== undefined && entry.delta !== 0) && "text-white"
)}>
  {formatDisplayValue(entry)}
</div>
```

**Sort toggle UI** -- add an `ArrowUpDown` or `ArrowDown/ArrowUp` icon button next to the time period row:
```tsx
<button
  onClick={() => setSortDirection(d => d === 'desc' ? 'asc' : 'desc')}
  className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
>
  {sortDirection === 'desc' ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
</button>
```

**Reset sort direction** when switching categories or time periods to avoid confusion.

