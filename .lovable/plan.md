

# Historical Tip and Bounty Data for Leaderboard

## Summary

Populate the "Spent" and "Paid" (earnings) leaderboard categories with historical on-chain data by tracing DHB Transfer events involving **four contracts** across two chains: the tip contracts and the StreamController (bounty) contracts.

## What Counts as Spent vs Earned

| Action | DHB Flow | Category |
|--------|----------|----------|
| Send a tip | User transfers DHB to Tip Contract | **Spent** |
| Receive a tip | Tip Contract transfers DHB to User | **Earned (Paid)** |
| Mint a bounty post | User transfers DHB to StreamController | **Spent** |
| Claim a bounty | StreamController transfers DHB to User | **Earned (Paid)** |

## Contracts to Trace

| Chain | Contract | Address | Role |
|-------|----------|---------|------|
| Base | Tip Contract | `0x4fa30dAef50c6dc8593470750F3c721CA3275581` | Tips |
| Base | StreamController | `0x4fa30dAef50c6dc8593470750F3c721CA3275581` | Bounties (same address as tip on Base) |
| BNB | Tip Contract | `0x6E19ba22da239C46941582530c0Ef61400B0e3e6` | Tips |
| BNB | StreamController | `0x9f8012074d27F8596C0E5038477ACB52057BC934` | Bounties |

Note: On Base, the tip contract and StreamController are the same address, so we only need to trace one address. On BNB, they are different, so we trace both.

## DHB Token Addresses (for Transfer event logs)

| Chain | DHB Token |
|-------|-----------|
| Base | `0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c` |
| BNB | `0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7` |

## Changes

### 1. Database Migration

Add `sent_tips` and `received_tips` columns to `leaderboard_snapshots`:

```sql
ALTER TABLE leaderboard_snapshots
  ADD COLUMN IF NOT EXISTS sent_tips numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_tips numeric NOT NULL DEFAULT 0;
```

### 2. New Edge Function: `backfill-tip-snapshots`

A one-time backfill function that:

1. Gets the holder list from `leaderboard_cache` (holdings/all)
2. For each period (1d, 7d, 30d, 365d), calculates target blocks on Base and BNB
3. Queries `eth_getLogs` on the DHB token contracts for `Transfer` events where:
   - **Spent**: `to` is any of the tip/bounty contracts (user sent DHB in)
   - **Earned**: `from` is any of the tip/bounty contracts (user received DHB out)
4. Aggregates totals per wallet address
5. Upserts into `leaderboard_snapshots` with `sent_tips` and `received_tips`

On BNB, two separate contract addresses must be checked (tip + StreamController). On Base, they share the same address so one query covers both.

### 3. Update `refresh-leaderboard-cache`

Modify Section 3 (currently API-based for sentTips/receivedTips) to:

- During daily snapshots, also query recent Transfer events and store `sent_tips`/`received_tips`
- For time-based periods (day, week, month, year), compute deltas from snapshots rather than relying on the DeHub API
- Keep DeHub API as fallback for the "all" period

### 4. No Frontend Changes

The leaderboard UI already supports `sentTips`/`receivedTips` categories with delta display. Once the cache is populated with historical data, it works automatically.

## Technical Details

### Transfer Event Signature
```text
topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
```

### Query Pattern (eth_getLogs)

For **Spent** (user -> contract):
```json
{
  "address": "<DHB_TOKEN>",
  "fromBlock": "<TARGET_BLOCK>",
  "toBlock": "latest",
  "topics": [
    "0xddf252ad...",
    null,
    "<CONTRACT_ADDRESS_PADDED>"
  ]
}
```

For **Earned** (contract -> user):
```json
{
  "address": "<DHB_TOKEN>",
  "fromBlock": "<TARGET_BLOCK>",
  "toBlock": "latest",
  "topics": [
    "0xddf252ad...",
    "<CONTRACT_ADDRESS_PADDED>",
    null
  ]
}
```

On BNB, we run these queries for both the tip contract and StreamController separately, then merge the results. On Base, one query per direction suffices since both are the same address.

### Block Estimation

Same approach as existing `backfill-leaderboard-snapshots`:
- Base: ~43,200 blocks/day (2s block time)
- BNB: ~28,800 blocks/day (3s block time)

### Rate Limiting

- 200ms between RPC batches
- Alchemy primary with BNB public RPC fallbacks (same pattern as existing code)

## Execution Order

1. Run database migration (add columns)
2. Deploy `backfill-tip-snapshots` edge function
3. Update `refresh-leaderboard-cache` to track tips/bounties daily
4. Run backfill once to populate historical data
5. Daily refresh handles it going forward
