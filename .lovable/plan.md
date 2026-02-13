

# Fix: Missing Leaderboard Accounts (sixseven, lowkeyfr)

## Root Cause

The `refresh-leaderboard-cache` edge function builds the holdings leaderboard by:
1. Fetching the holder list from the DeHub API (`/api/leaderboard?sort=holdings`)
2. Querying on-chain balances only for those returned addresses

New accounts not yet indexed by the DeHub API are never queried, so they don't appear -- even if they hold large balances.

## Short-Term Fix: Add to EXTRA_WALLETS

Add the wallet addresses for `sixseven` and `lowkeyfr` to the `EXTRA_WALLETS` map in `supabase/functions/refresh-leaderboard-cache/index.ts` (lines 191-194). This is the same pattern used for `maldoteth` and `outoforrder`.

**Requires**: The wallet addresses for both accounts from the user.

```text
File: supabase/functions/refresh-leaderboard-cache/index.ts

EXTRA_WALLETS = {
  maldoteth: { ... },
  outoforrder: { ... },
+ sixseven: { wallet: "0x...", displayName: "sixseven" },
+ lowkeyfr: { wallet: "0x...", displayName: "lowkeyfr" },
};
```

## Long-Term Fix (Optional): Auto-Discovery

To avoid manually adding every new large holder, we could enhance the refresh function to also query the DeHub API's user search or profile endpoint for known usernames, extracting their wallet addresses and including them automatically. This would be a separate follow-up task.

## Technical Details

- **File changed**: `supabase/functions/refresh-leaderboard-cache/index.ts` (line ~191)
- **Deployment**: The edge function will auto-deploy after the edit
- **Effect**: On the next 5-minute cache refresh cycle, both accounts will appear in the leaderboard with their correct on-chain balances
- **Blocker**: Need wallet addresses from the user before implementation

