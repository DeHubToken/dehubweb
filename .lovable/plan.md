

## Fix On-Chain Badge/Leaderboard Balance Queries

### Root Causes

1. **BNB Alchemy RPC calls failing silently**: The `rpcCall` helper swallows errors -- if the BNB endpoint returns an error object instead of a `result`, it falls back to `'0x0'` with no logging. This means the ~4M BNB token balance reads as 0.

2. **Staking contract function mismatch**: The staking contract at `0x26d2Cd7763106FDcE443faDD36163E2ad33A76E6` is **not** an ERC-20 token. Using the `balanceOf(address)` selector (`0x70a08231`) likely returns nothing or reverts, which silently becomes 0. We need to identify the correct function selector for reading a user's staked amount.

3. **`get-badge-balance` not deployed**: The edge function returns 404.

### Fix Plan

#### Step 1: Identify the correct staking contract function

We need to determine what view function the staking contract exposes for reading staked balances. Common patterns:
- `stakes(address) returns (uint256)`
- `userStake(address) returns (uint256)`
- `stakedBalanceOf(address) returns (uint256)`

I will add **diagnostic logging** to the `rpcCall` function so we can see the raw RPC response, and test multiple function selectors against the staking contract using the edge function. This will tell us exactly which function works.

#### Step 2: Update `rpcCall` in both edge functions to log errors

**Files**: `supabase/functions/get-badge-balance/index.ts`, `supabase/functions/refresh-leaderboard-cache/index.ts`

```text
Current:  return json.result || '0x0';
Fixed:    Log json.error if present, then return json.result || '0x0';
```

#### Step 3: Add staking contract function discovery

Add a temporary diagnostic endpoint or logging that tries multiple known function selectors against the staking contract to find the one that returns the 15M staked balance for `0x30be6bb2b805fc507829c6bac4f9183044a1969f`.

Common selectors to try:
- `0x70a08231` -- `balanceOf(address)` (current, likely wrong for staking)
- `0x584b62a1` -- `stakes(address)`
- `0x16934fc4` -- `staked(address)`
- `0x65da1264` -- `stakes(address)` (alternate hash)

Once the correct selector is found, update `STAKING_BALANCE_SELECTOR` in both edge functions.

#### Step 4: Deploy both edge functions

Deploy `get-badge-balance` and `refresh-leaderboard-cache` with the fixes.

#### Step 5: Verify with the test wallet

Call the `get-badge-balance` function with `0x30be6bb2b805fc507829c6bac4f9183044a1969f` and confirm the result is ~49M (30M + 4M + 15M).

#### Step 6: Re-trigger leaderboard cache refresh

Invoke `refresh-leaderboard-cache` to rebuild the holdings leaderboard with correct totals.

---

### Technical Details

**Files modified**:
- `supabase/functions/get-badge-balance/index.ts` -- add error logging to `rpcCall`, update staking function selector
- `supabase/functions/refresh-leaderboard-cache/index.ts` -- same changes

**Key question to resolve**: What is the correct function signature on the staking contract? The implementation will test multiple selectors and use the one that returns the expected ~15M for the test wallet. If none of the common selectors work, we may need to read the contract ABI from BscScan/BaseScan.

