

# Revert Leaderboard to Direct On-Chain Historical Queries

## Problem
The current snapshot-based system for time-period leaderboards (1d, 1w, 1m, 1y) is broken because it queries for an exact past date that often has no snapshot. Rather than patching this with "closest date" logic, we'll revert to querying historical on-chain balances directly using past block numbers -- the same approach used in the `backfill-leaderboard-snapshots` function, which was fast and low-cost on Alchemy.

## Approach
Modify **`supabase/functions/refresh-leaderboard-cache/index.ts`** to compute historical balances on-chain at estimated past block numbers instead of looking them up in the `leaderboard_snapshots` table.

## Changes

**File: `supabase/functions/refresh-leaderboard-cache/index.ts`**

1. **Add block estimation constants** (from the backfill function):
   - `BASE_BLOCKS_PER_DAY = 43200` (~2 sec/block)
   - `BNB_BLOCKS_PER_DAY = 28800` (~3 sec/block)

2. **Add helper functions** (from the backfill function):
   - `getCurrentBlockNumber(rpcUrl)` -- fetches current block via `eth_blockNumber`
   - `rpcCallAtBlock(rpcUrl, to, data, blockTag)` -- like `rpcCall` but accepts a block tag parameter
   - `getHistoricalBalance(address, baseRpc, bnbRpc, baseBlockHex, bnbBlockHex)` -- queries balanceOf + userInfos at specific historical blocks

3. **Replace snapshot-based delta computation** (lines ~364-430) with on-chain historical queries:
   - Before the period loop, fetch current block numbers for both Base and BNB chains
   - For each period (day/week/month/year), calculate the target block number by subtracting `BLOCKS_PER_DAY * daysAgo`
   - Query each holder's historical balance at that block in batches of 10 (with 200ms delays, same as current batching)
   - Compute delta as `currentBalance - historicalBalance`
   - Still save today's snapshot for record-keeping (keep existing snapshot logic)

4. **Apply the same pattern to social metrics** (lines ~484-548):
   - Social metrics (followers, likes, subscribers) are NOT on-chain, so they must still use snapshots
   - Fix these to use the "closest available snapshot" approach (`.lte` + `.order` + `.limit(1)`) since there's no on-chain alternative

## What stays the same
- Daily snapshot creation (line 298-339) -- still useful as a record
- "All" period caching -- unchanged
- API-based categories (sentTips, receivedTips) -- unchanged
- Extra wallet injection -- unchanged
- The `backfill-leaderboard-snapshots` function -- unchanged, still useful for seeding

## Technical Detail

```text
Current flow (broken):
  holders -> snapshot table lookup (exact date) -> often empty -> delta = 0

New flow (reliable):
  holders -> eth_call at past block number -> always returns data -> accurate delta
```

The on-chain approach adds roughly `holders * 3 RPC calls * 4 periods` extra calls per refresh. For ~50 holders, that's ~600 calls across 4 periods, which is well within Alchemy's free tier and completes quickly with the existing batching.

