

# Fix: Yearly Holdings Leaderboard Shows Only 5 Entries

## Problem
The yearly leaderboard only shows ~5 people because no valid snapshot exists from 365 days ago. The hybrid on-chain fallback (which could fetch historical balances) is gated by `pastMap.size > 0` — meaning it only runs when there IS a snapshot. When there's no snapshot, every wallet gets `delta = 0` and gets filtered out, except a handful of hardcoded "extra wallets."

## Root Cause
Line 405 in `refresh-leaderboard-cache/index.ts`:
```
if (useHybridOnChain && pastMap.size > 0) {
```
This condition prevents hybrid on-chain lookups when no snapshot exists. For yearly period, if snapshots don't go back far enough, all users are silently dropped.

## Fix

### File: `supabase/functions/refresh-leaderboard-cache/index.ts`

1. **Remove the `pastMap.size > 0` gate on hybrid on-chain** — when `useHybridOnChain` is true and `pastMap` is empty, treat ALL addresses as "new" and fetch their historical on-chain balances. This is effectively a full on-chain fallback for the yearly period.

2. **Change the condition** from:
   ```ts
   if (useHybridOnChain && pastMap.size > 0) {
   ```
   to:
   ```ts
   if (useHybridOnChain) {
   ```
   And adjust the `newAddresses` logic: when `pastMap` is empty, ALL addresses need on-chain lookup.

3. **Also handle the case where both `pastVal` is undefined AND `hybridPastMap` returns nothing** — for yearly with on-chain, treat missing historical balance as 0 (meaning the user's entire current balance is their yearly gain). This matches how a new holder would naturally appear.

   Change lines 529-535 from:
   ```ts
   } else if (isExtraWallet && currentVal > 0) {
     delta = currentVal;
   } else {
     delta = 0;
   }
   ```
   to also include the hybrid on-chain case: if `useHybridOnChain` is active and on-chain was attempted but the wallet truly had 0, treat the full balance as delta.

4. **Redeploy the edge function** so the next cache refresh picks up all holders.

## Technical Detail
- The on-chain historical lookup estimates blocks from ~365 days ago using `BASE_BLOCKS_PER_DAY * 365` and `BNB_BLOCKS_PER_DAY * 365`
- Alchemy supports `eth_call` at historical blocks, so this will work even for a year back
- The batch RPC logic already handles large address lists in chunks of 50

## Result
After the fix and a cache refresh, the yearly leaderboard will show all holders who gained or lost tokens over the past year, including @aaron.

