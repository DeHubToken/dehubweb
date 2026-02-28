

## Problem

The leaderboard edge function has a bug on line 474 where **month and year periods only show sellers (negative delta) when hybrid on-chain mode activates** — which only happens when new wallets not in the snapshot need on-chain lookup.

The condition:
```text
isHybridHoldings ? e.delta !== 0 : e.delta > 0
```

- Day/Week (pure on-chain, line 263-264): filters `delta !== 0` → shows both gains AND losses ✓
- Month/Year when hybridPastMap exists: filters `delta !== 0` → shows both ✓
- Month/Year when ALL wallets are in snapshot (hybridPastMap is null): filters `delta > 0` → **hides sellers** ✗

## Fix

In `supabase/functions/refresh-leaderboard-cache/index.ts`, change line 472-478 so that month/year holdings always show bidirectional data (both gains and losses), regardless of whether hybrid on-chain was used:

```text
Current (line 472-474):
  const isHybridHoldings = useHybridOnChain && hybridPastMap;
  const sorted = withDeltas
    .filter((e) => e.delta !== undefined && (isHybridHoldings ? e.delta !== 0 : e.delta > 0))

Fixed:
  const isBidirectional = useHybridOnChain || useOnChain;
  const sorted = withDeltas
    .filter((e) => e.delta !== undefined && (isBidirectional ? e.delta !== 0 : e.delta > 0))
```

And update the sort on line 475-477 and the log on line 495 to use `isBidirectional` instead of `isHybridHoldings`.

This ensures month/year always show both buyers and sellers, matching the day/week behavior. A cache refresh will be needed after deploying.

