

# Auto-Discover Missing Leaderboard Holders

## Problem
New users with large DHB bags don't appear on the leaderboard because the DeHub API hasn't indexed them yet. Currently we manually add wallets to `EXTRA_WALLETS`, which doesn't scale.

## Solution
Add a **holder discovery step** to the `refresh-leaderboard-cache` edge function that:

1. **Scans on-chain Transfer events** for the DHB token on both Base and BNB to collect all unique holder addresses
2. **Batch-queries balances** for any addresses not already in the leaderboard set
3. **Cross-references against the DeHub API** (via `/api/feed?type=accounts&search=...` or profile lookup by address) to find registered usernames
4. **Merges discovered holders** into the leaderboard data

## Implementation Steps

### Step 1: Add Transfer event scanning to the edge function

In `supabase/functions/refresh-leaderboard-cache/index.ts`, after fetching the DeHub leaderboard (line ~248), add a function that uses `eth_getLogs` to scan ERC-20 Transfer events on both chains:

```text
ERC-20 Transfer event topic:
0xddf252ad1be2c89b69c2b63afed7a5cf3e9ce6b1aac6bfd916af828623799ee4

Scan last ~500k blocks on Base and ~200k blocks on BNB
Collect all unique 'to' addresses from Transfer logs
```

### Step 2: Filter to new addresses only

Remove any addresses already present in the `enriched` array (from the DeHub API response + EXTRA_WALLETS). This avoids redundant RPC calls.

### Step 3: Batch-query balances for new addresses

Use the existing `getOnChainBalance()` function in batches of 10, keeping only addresses with balance > 10,000 DHB (the minimum staking tier threshold). This filters out dust holders and keeps the query count manageable.

### Step 4: Resolve addresses to DeHub usernames

For each discovered address with a significant balance, call the DeHub API to check if it's a registered user:
- Use `GET /api/feed?type=accounts&search={address}` to look up the address
- If a match is found, extract the username, displayName, and avatarUrl
- If no match, still include them in the leaderboard with just the wallet address

### Step 5: Merge into enriched results

Add discovered holders to the `enriched` array before sorting and caching. They'll automatically get included in delta calculations for time-based periods too.

## Technical Details

**File changed:** `supabase/functions/refresh-leaderboard-cache/index.ts`

**New function to add:**
- `discoverOnChainHolders(baseRpc, bnbRpc, existingAddresses)` -- scans Transfer events, queries balances, resolves usernames

**RPC calls added per refresh:**
- 2 `eth_getLogs` calls (one per chain) for Transfer event scanning
- ~N balance queries for newly discovered addresses (batched, only for non-dust holders)
- ~N DeHub API calls for username resolution

**Performance considerations:**
- Only scans addresses NOT already in the leaderboard, so the extra load is minimal after the first run
- 10,000 DHB minimum threshold filters out most dust/bot addresses
- Results get cached, so discovered holders persist across refreshes
- The `EXTRA_WALLETS` map can still be used for manual overrides when needed

**Estimated added time per refresh:** 5-15 seconds depending on how many new holders are discovered

