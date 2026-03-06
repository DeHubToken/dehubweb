

# Fresh On-Chain RPC Scan for Daily & Weekly Holdings

## What This Does

The existing `refresh-leaderboard-cache` edge function already has full support for this. No code changes needed -- just an invocation.

I will call the edge function with:
```json
{ "mode": "light", "sorts": ["holdings"], "periods": ["day", "week"] }
```

This triggers:
1. Reads the existing `holdings/all` cache for the full list of wallet addresses
2. Gets current block numbers on Base and BNB chains via Alchemy RPC
3. Estimates historical block heights (1 day ago / 7 days ago)
4. Fetches on-chain balances at both current and historical blocks for all addresses (batches of 10)
5. Computes deltas (gains and losses) for each wallet
6. Caches results into `leaderboard_cache` table for `holdings/day` and `holdings/week`

Monthly, yearly, and all-time data remain untouched.

The UI already reads from `leaderboard_cache` with these sort/period keys, so 1D and 1W tabs will populate automatically after the scan completes.

**Note:** This function can take 30-60+ seconds depending on how many wallets are in the leaderboard. Edge functions have a timeout limit, so if it times out we may need to reduce the batch or split the call.

