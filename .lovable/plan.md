

## Fix: Simplify Unstake to Database-Only Operation

### Problem
`handleUnstake` calls `unstakeBNB()` which tries to execute an on-chain `unstake()` function on the legacy BNB staking contract. But the current staking model is transfer-based (tokens sent to a vault address) — there is no `unstake()` function to call, so it always fails.

### Solution
Replace the on-chain contract call with a simple database insert into `staking_records` with `action: 'unstake'`. The `useUserStakingData` hook already calculates net staked by subtracting unstake records from stake records (lines 127-134), so this will automatically update the user's displayed staked balance.

### Changes

**`src/pages/app/StakingPage.tsx`** — Rewrite `handleUnstake`:
- Remove the `unstakeBNB()` contract call
- Validate that `amount <= userStaked`
- Insert a record into `staking_records` with `{ wallet_address, amount, chain: 'unified', tx_hash: 'unstake-request-<timestamp>', action: 'unstake' }`
- Show success toast, clear input, refetch stats/user/queue

**No other files need changes.** The hook already handles unstake records correctly.

