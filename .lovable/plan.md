

# Fix: Leaderboard Scanner Missing Base & New Staking Balances

## Root Cause

The user staked 499,000 DHB on Base on March 15. Their leaderboard balance dropped from 1.63M to 1.13M because:

- The scanner reads their Base wallet balance (which decreased by 499k after staking)
- The scanner only reads staked amounts from the **legacy BNB contract** (`0x26d2...` via `userInfos`)
- It does **not** check the **new unified staking address** (`0xcF573a682Bf7A7Cc58000e9eCA9c9d04dA102Da7`) or the **legacy Base staking address** (`0x7b10dd033Ac41B8AF85eE1701e344B86e446250B`)

The wallet page correctly shows staked balance because it uses DB staking records + legacy BNB contract. But the leaderboard scanner is purely on-chain and misses the new staking flow entirely.

## Fix

**File**: `supabase/functions/refresh-leaderboard-cache/index.ts`

Update `getOnChainBalanceAtBlock` to also query staked DHB held at:
1. The **new unified staking address** on both Base and BNB — read the user's share from DB `staking_records` (since it's a simple transfer, there's no on-chain `balanceOf` per user)
2. OR better: query the **Supabase `staking_records` table** to add net staked amounts on top of the on-chain wallet scan

**Recommended approach**: Since the new staking is transfer-based (no per-user on-chain query possible), the scanner should:

1. After computing on-chain wallet balances, **fetch all `staking_records`** from the database
2. Calculate net staked per wallet (sum of `stake` minus `unstake` actions)
3. Add net staked to each user's `total` and `badgeBalance`

This matches exactly how the wallet page resolves totals (DB records + legacy BNB contract).

## Changes

1. **`supabase/functions/refresh-leaderboard-cache/index.ts`**:
   - After the main on-chain balance scan, query `staking_records` table for all wallets
   - Build a map of `wallet_address → net_staked_amount`
   - Add the net staked amount to each entry's `total` and `badgeBalance`
   - Apply the same logic in `getOnChainBalanceAtBlock` paths (current and historical blocks)
   - For historical block comparisons, filter staking records by `created_at` date

2. **Re-run the leaderboard refresh** after deploying to update this user's entry

## Technical Detail

```text
Current flow:
  total = balanceOf(Base) + balanceOf(BNB) + userInfos(BNB legacy staking)

Fixed flow:
  total = balanceOf(Base) + balanceOf(BNB) + userInfos(BNB legacy staking)
        + net_staked_from_db (sum of stake - unstake from staking_records)
```

The DB staking records are authoritative because each record is only inserted after verifying a real `Transfer` event on-chain.

