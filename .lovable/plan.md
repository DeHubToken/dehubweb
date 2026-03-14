

# Remove Max button styling & show staked amount in unstake input

**File**: `src/pages/app/StakingPage.tsx`

**Two changes:**

1. **Line 405**: Change placeholder from `"Amount DHB"` to show the user's staked balance (e.g. `"12,345 DHB"`) — same pattern used in the stake input on line 352.

2. **Lines 410-416**: Remove the badge/border styling from the Max button. Change from `rounded-md bg-amber-500/20 text-amber-400 ... px-2 py-0.5` to plain text style: `text-amber-400 text-[10px] font-bold uppercase hover:text-amber-300 transition-colors` — no background, no border, no padding.

