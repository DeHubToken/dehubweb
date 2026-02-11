

## Fix: BNB Balance Not Showing in Leaderboard

### What's Happening

The on-chain balance queries are **already working correctly** after the BNB address fix. Edge function logs confirm:

- **coinage** (`0x0851...`): base=0, bnb=6,142,985, staked=50,000,000, total=56,142,985
- **mike** (`0x2851...`): bnb=0.008, staked=156,937,297, total=156,937,297

However, the **leaderboard cache** was last refreshed at 17:08 UTC — **before** the BNB address was corrected. That's why coinage still shows 50M instead of 56M.

### Plan

**Step 1: Deploy `refresh-leaderboard-cache`** to ensure the latest code (with the corrected BNB address) is live.

**Step 2: Trigger a leaderboard cache refresh** by calling the `refresh-leaderboard-cache` edge function. This will re-query all holders with the correct BNB contract address and update the cached data.

**Step 3: Verify** that coinage now shows ~56M and the BNB balances are reflected in the leaderboard.

### Technical Details

No code changes needed — the fix was already applied in the previous edit. This is purely a redeployment and cache refresh.

- **File**: `supabase/functions/refresh-leaderboard-cache/index.ts` (already has correct `DHB_BNB = '0x680d3113caf77b61b510f332d5ef4cf5b41a761d'`)
- **File**: `supabase/functions/get-badge-balance/index.ts` (already has correct address)
