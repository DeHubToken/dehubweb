

## Fix: Talk of the Town Tickers — Seamless Period Switching

**Problem**: Changing the date filter (1D/1W/1M/1Y/All) causes the ticker list to unmount, flash empty, and trigger scroll jumps because each period switch creates a new query key, causing React Query to return empty data while fetching.

**Root Cause**: The `useQuery` call at line 31 lacks `placeholderData`, so switching periods momentarily returns `[]`, which triggers the empty state → AnimatePresence exit/enter → layout shift → scroll jump.

**Fix** (single file — `src/components/app/WhatsHappening.tsx`):

1. Add `placeholderData: (previousData) => previousData` to the `useQuery` config (keeps previous tickers visible while the new period loads)
2. Wrap the tickers list in a stable container that doesn't re-key on period change — currently the entire tickers `motion.div` stays keyed as `"tickers"` which is correct, but the inner list flickers because `topTickers` briefly becomes `[]`

That single `placeholderData` addition should eliminate the remount/scroll/flash entirely. No other changes needed.

