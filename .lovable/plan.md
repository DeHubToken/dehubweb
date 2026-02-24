

## How Period Data Works (and Why We Can Remove On-Chain Calls)

The 1d/1w/1m/1y data is computed entirely from **database snapshots** — not from on-chain calls. Here's the flow:

```text
┌─────────────────────────────────────────────────┐
│  FULL REFRESH (3 AM UTC daily)                  │
│                                                 │
│  1. Fetch leaderboard from DeHub API            │
│  2. For EACH wallet (batches of 5):             │
│     → balanceOf on Base  ← REDUNDANT RPC CALL   │
│     → balanceOf on BNB   ← REDUNDANT RPC CALL   │
│     → userInfos (staking)← REDUNDANT RPC CALL   │
│  3. Save today's snapshot to leaderboard_snapshots│
│  4. Compute deltas: today − snapshot_from_N_days │
│  5. Cache results in leaderboard_cache          │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  LIGHT REFRESH (every 6 hours)                  │
│                                                 │
│  Pure DB: load "all" cache + compare snapshots  │
│  No RPC calls at all ← This one is fine         │
└─────────────────────────────────────────────────┘
```

The period deltas are just: **current value − snapshot value from N days ago**. The snapshots are already in the database. The on-chain RPC calls in step 2 are redundant because the DeHub API already returns `total` (which includes holdings + staking). The function even has a fallback: `const effectiveBalance = onChainBalance > 0 ? onChainBalance : apiTotal;`

## Plan: Remove On-Chain RPC Calls, Keep Snapshots

**What changes in `refresh-leaderboard-cache/index.ts`:**

1. **Remove all RPC/Alchemy calls** — `getOnChainBalance`, `rpcCall`, `bnbRpcCall`, `getCurrentBlockNumber`, `queryTipEvents`, `getLogs`, etc.
2. **Use the API-provided `total` directly** as the balance (it already includes Base + BNB + staking)
3. **Keep the snapshot system intact** — still upsert today's values into `leaderboard_snapshots` using API data
4. **Keep `computeSnapshotDelta`** — unchanged, it's pure DB work
5. **Keep extra wallets** — but instead of on-chain lookup, fetch their profile from the DeHub API (`/api/user?account=ADDRESS`) to get their `total`
6. **For tip snapshots** — use the `sentTips`/`receivedTips` values from the API response instead of scanning Transfer event logs

**What stays the same:**
- Snapshot-based delta computation (1d/1w/1m/1y)
- Light refresh mode (already RPC-free)
- All sort modes (holdings, followers, likes, subscribers, sentTips, receivedTips)
- Cache structure and periods

**Impact:**
- Full refresh drops from ~3-5 minutes of execution to ~10-15 seconds (just API calls + DB writes)
- Eliminates all Alchemy RPC costs from the cron job
- Eliminates the massive cloud credit burn from long-running edge function execution
- Period data continues working exactly as before

