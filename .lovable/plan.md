

## Add "waifu" to Leaderboard + Improve Discovery

### Problem
The auto-discovery system scans only recent Transfer logs (~12 days on Base, ~7 days on BNB). Wallet `0xb4ba0e4b4596b7e8a074fe6156d4f666ebdba000` (waifu) likely acquired tokens outside that window and was never picked up.

### Changes

**File: `supabase/functions/refresh-leaderboard-cache/index.ts`**

1. **Add waifu to EXTRA_WALLETS** (immediate fix)
   - Add entry: `waifu: { wallet: "0xb4ba0e4b4596b7e8a074fe6156d4f666ebdba000", displayName: "waifu" }`
   - This ensures they appear on the next cache refresh cycle

2. **Increase discovery scan range** (prevent future gaps)
   - Base: increase from 500k to 1,000,000 blocks (~23 days coverage)
   - BNB: increase from 200k to 500,000 blocks (~17 days coverage)
   - This doubles the lookback window so fewer holders slip through

### Technical Details

The EXTRA_WALLETS map at line ~197 gets a new entry. The scan range constants at lines 260-261 get updated values. The edge function will be redeployed automatically.

