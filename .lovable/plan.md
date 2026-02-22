

# Leaderboard Cache Optimization Plan

## Current Problem

The `refresh-leaderboard-cache` cron runs every 6 hours and performs ~100+ operations per run (RPC calls, DB reads/writes, API calls). Most of this work is redundant for short periods.

## Proposed Architecture: "Freeze + Delta" Strategy

### What changes

| Period | Current approach | New approach |
|--------|-----------------|--------------|
| All | DeHub API + on-chain balance (every 6h) | Same, but reduce to once per day |
| Year | Snapshot delta (every 6h) | Freeze: refresh once per week |
| Month | Snapshot delta (every 6h) | Freeze: refresh once per day |
| Week | Snapshot delta (every 6h) | Live delta: query only the ~50 known wallets on-chain, compare to cached "all" balances from 7 days ago |
| Day | Snapshot delta (every 6h) | Live delta: query only the ~50 known wallets on-chain, compare to yesterday's snapshot |

### How it works

1. **Keep the daily snapshot** -- this is cheap (one DB write per day) and provides the foundation for all deltas. No change needed here.

2. **Split the cron into two frequencies:**
   - **Heavy refresh (once/day):** Full on-chain balance scan, DeHub API calls, snapshot creation, year/month/all cache updates
   - **Light refresh (every 6h or even 2h):** Only recompute day/week by reading 2 snapshots from DB and comparing. No RPC calls, no API calls. Just DB reads + cache writes.

3. **For tips (sentTips/receivedTips) day/week:** Query Transfer events for only the last 7 days of blocks (already done for snapshots). Cache the result. For daily, just use today's snapshot vs yesterday's.

### Cost reduction estimate

| Resource | Current (per day) | New (per day) |
|----------|------------------|---------------|
| RPC calls | ~120 (30 x 4) | ~30 (30 x 1) |
| Tip log queries | ~24 (6 x 4) | ~6 (6 x 1) |
| DB operations | ~140 (35 x 4) | ~50 (35 x 1 heavy + 15 x 1 light) |
| DeHub API calls | ~12 (3 x 4) | ~3 (3 x 1) |

**Estimated 70-75% reduction in cloud resource usage.**

### Why this is better than querying raw transactions

Your idea of "query the last week of transactions and match to users" would work for tips, but for **holdings** (balance changes) there's no single transaction log to query -- you'd need to check every wallet's balance individually anyway. The snapshot approach is already the cheapest way to do holdings deltas.

For tips, querying Transfer events for the last 7 days is essentially what the current system does for the daily snapshot. We just need to avoid doing it 4 times a day.

## Technical Implementation

### Step 1: Add a "mode" parameter to the edge function

The cron will call the function with `mode=full` (once/day) or `mode=light` (every 6h).

- `mode=full`: Everything it does today (on-chain, API, snapshots, all periods)
- `mode=light`: Only recompute day/week caches using existing snapshots (pure DB reads, no RPC/API)

### Step 2: Update the cron schedule

Replace the single 6-hour cron with two:
- Full refresh: once daily (e.g., 03:00 UTC)
- Light refresh: every 4-6 hours (only day/week delta recalculation)

### Step 3: Freeze year/month cache updates

In `mode=light`, skip year/month/all entirely. These only change meaningfully on a daily basis anyway.

### Step 4: Optional -- reduce "all" period to DeHub-only

Since the DeHub API already returns the "all" leaderboard, we could skip on-chain balance verification for the "all" period entirely and only do on-chain checks for period-based deltas. This would cut another ~30 RPC calls from the heavy refresh.

