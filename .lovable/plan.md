

## Root Cause Found

The snapshots are garbage. Look at account `0x0851...` (the whale):
- **Real on-chain balance**: 56.1M DHB (has been this for 400+ days)
- **Snapshots Feb 14-24**: Show 50M (wrong -- this came from the DeHub API which lies)
- **Snapshot Feb 25 (today)**: Shows 56.1M (correct -- today's snapshot was created after the on-chain code was added)
- **Snapshot Feb 13 and before**: Shows 56.1M (correct -- these were created by the old backfill function which used on-chain RPC)

So the daily leaderboard shows `56.1M - 50M = +6.1M delta` which is fake. The whale didn't gain anything. The snapshot was just wrong.

**The core problem**: Snapshots are created from DeHub API data (line 591: `balance: e.total`), and the DeHub API returns inaccurate balances. The old backfill function used Alchemy RPC and got correct data, but then the full refresh started writing API-sourced snapshots that overwrote/replaced accurate data.

## Plan

Since you chose "on-chain block estimate" and "gains + losses":

**For daily and weekly holdings only**, bypass snapshots entirely and do a pure on-chain comparison:

1. **Add `eth_blockNumber` + historical block estimation** to the edge function
   - Get current block number on Base and BNB
   - Estimate block N days ago: `currentBlock - (blocksPerDay * daysAgo)`
   - Base: ~43,200 blocks/day (2s block time)
   - BNB: ~28,800 blocks/day (3s block time)

2. **Add `getHistoricalOnChainBalance`** function
   - Same as `getOnChainBalance` but passes a historical block tag instead of "latest"
   - Queries `balanceOf` and `userInfos` at the estimated past block

3. **Modify `computeSnapshotDelta`** for `useOnChain` path:
   - Current: fetches on-chain "now" but still uses snapshots for "past" (broken)
   - New: fetch on-chain "now" AND on-chain "N days ago" using block estimation
   - Skip the snapshot `pastMap` entirely for daily/weekly holdings

4. **Show both gains AND losses** for daily/weekly holdings:
   - Remove the `.filter(e.delta > 0)` gate for these periods
   - Keep it for other sort modes/periods

5. **No changes** to monthly, yearly, or all-time (they continue using snapshots)

### Technical Details

```text
Current flow (broken):
  daily holdings = on-chain NOW - snapshot YESTERDAY (API-sourced, wrong)

New flow (fix):
  daily holdings = on-chain NOW (latest block) - on-chain YESTERDAY (estimated block)
  weekly holdings = on-chain NOW (latest block) - on-chain 7 DAYS AGO (estimated block)
```

The `rpcCall` function already exists but only supports `"latest"`. It needs a `blockTag` parameter (already present in `backfill-leaderboard-snapshots/index.ts` which does exactly this). The batch function needs the same treatment.

### Files Changed

- `supabase/functions/refresh-leaderboard-cache/index.ts` -- add historical block support, modify delta computation for daily/weekly holdings, allow negative deltas

### Risk

- Fetching on-chain balances for ~500 wallets at 2 different block heights = ~3000 RPC calls. At batch size 10 this takes ~50 batches x 2 time points = ~100 sequential rounds. Should complete within edge function timeout but will be slower than snapshot-based approach.
- Block estimation has small time offset (~minutes) but is acceptable for daily/weekly granularity.

