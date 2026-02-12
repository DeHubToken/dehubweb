
## Fix: Populate `badgeBalance` in the Leaderboard Cache

### Problem
Every entry in the leaderboard cache has `badgeBalance: null`. The `refresh-leaderboard-cache` edge function computes on-chain totals (Base holdings + BNB holdings + BNB staked) and stores them as `total`, but never populates the `badgeBalance` field. The DeHub API doesn't provide it either, so the previous fix (prioritizing `entry.badgeBalance`) still falls back to the batch RPC call, which is unreliable.

### Root Cause
Line 257 of `refresh-leaderboard-cache/index.ts` reads `badgeBalance` from the DeHub API response, which never includes it. Meanwhile, the `total` field already represents exactly what `badgeBalance` should be (combined holdings + staked).

### Solution
Set `badgeBalance` equal to the on-chain `total` that was already computed, instead of trying to read it from the API response.

---

### Technical Changes

**`supabase/functions/refresh-leaderboard-cache/index.ts`**

On line 257, change:
```typescript
badgeBalance: (entry.badgeBalance as number) ?? undefined,
```
to:
```typescript
badgeBalance: balances[idx],
```

This uses the already-computed on-chain balance (which includes Base holdings + BNB holdings + BNB staked) as the badge balance for each entry.

Also for the extra wallets injection (around line 273), add `badgeBalance: balance` to the pushed entry so those users get badges too.

After deploying, the next cache refresh (runs every 5 minutes) will populate `badgeBalance` for all entries. Every user with 10k+ total will then show their badge on both the main leaderboard and the sidebar.
