

## Fix: Vertically Center-Align All Rank Indicators

### Problem
The rank column uses `justify-start` (left-aligned), but the three types of rank indicators have different widths:
- Ranks 1-3: medals at 48px wide
- Ranks 4-5: plaques at 32px wide  
- Ranks 6+: number badges at 28px wide

Since they're all left-aligned, their visual centers are offset from each other.

### Solution
Give the rank column a fixed width matching the largest element (48px) and center all indicators within it. This ensures medals, plaques, and number badges all share the same vertical center line.

### Technical Changes

**`src/pages/app/LeaderboardPage.tsx`** (lines 332-351)

1. Change the rank container from `justify-start` to `justify-center` and set a fixed width of `w-12` (48px) so all items center within the same space.
2. Remove the `-ml-1` offset on medal containers since centering handles alignment now.

This way:
- 48px medals fill the full width, naturally centered
- 32px plaques center within 48px
- 28px number badges center within 48px

All rank indicators will share the same vertical center axis.

