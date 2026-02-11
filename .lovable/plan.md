

## One-Time Historical Balance Backfill

### Approach

Instead of using `alchemy_getAssetTransfers` (which doesn't support BNB Chain), we'll use **`eth_call` with historical block numbers**. This lets us query each wallet's `balanceOf` and staking balance at specific past blocks -- the same 3 RPC calls we already do, just with a block parameter instead of "latest".

This is more accurate than transfer history because it captures the **net balance** at each point, including staking/unstaking.

### How It Works

1. **Estimate historical block numbers** for 1 day, 7 days, 30 days, and 365 days ago:
   - Base: ~2 sec/block = ~43,200 blocks/day
   - BNB: ~3 sec/block = ~28,800 blocks/day
   - Get current block, subtract the appropriate offset

2. **For each holder** (348 wallets), query their Base balance + BNB balance + BNB staking at each historical block

3. **Insert snapshots** into `leaderboard_snapshots` for the corresponding past dates

4. **Trigger normal cache refresh** so the deltas are computed immediately

### Implementation

**New edge function: `backfill-leaderboard-snapshots`**

- One-time use function (can be deleted after running)
- Reads the current holder list from `leaderboard_cache` (holdings/all)
- For each of 4 time periods (1d, 7d, 30d, 365d ago):
  - Calculates the target block number on Base and BNB
  - Queries `balanceOf` and staking at those blocks for all 348 wallets
  - Inserts results into `leaderboard_snapshots` with the corresponding past date
- Processes wallets in batches of 10 with delays to stay within rate limits
- Total: ~348 wallets x 4 periods x 3 calls = ~4,176 RPC calls (manageable with batching)

**No changes needed to**:
- `refresh-leaderboard-cache` (already handles snapshots and deltas)
- `LeaderboardPage.tsx` (already displays deltas)
- Database schema (table already exists)

### After Running

Once the backfill completes, triggering a normal leaderboard refresh will compute deltas and the day/week/month/year views will immediately show "who increased the most" data.

### Technical Notes

- Block number estimation has ~1-2% margin of error due to variable block times, but this is acceptable for leaderboard purposes
- The function will take a few minutes to run due to rate limiting (348 wallets x 4 periods)
- After successful backfill, the function can be deleted since the daily snapshot flow handles everything going forward
