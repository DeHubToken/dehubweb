

# On-Chain Tip Tracking for Leaderboard (Spent/Paid)

## Current Situation

The leaderboard's **Spent** (sentTips) and **Paid** (receivedTips) categories rely entirely on the **DeHub API** (`/api/leaderboard`), which returns pre-aggregated `sentTips` and `receivedTips` numbers per user. These values come from the DeHub backend's internal database -- there's no on-chain querying happening for tips today.

## Why On-Chain Tip Tracking Is Possible

Tips on DeHub are **DHB ERC-20 token transfers**. Every tip generates a standard `Transfer(address from, address to, uint256 value)` event on the DHB token contract:
- **Base**: `0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c`
- **BNB**: `0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7`

These events are publicly queryable, timestamped by block number, and permanent -- meaning we can build historical aggregations (day/week/month/year) from real on-chain data.

## Architecture

The approach mirrors the existing `token-holders.ts` pattern (which already queries `TransferSingle` events via Alchemy RPC for fraction ownership):

1. **Backend Edge Function** (`query-tip-history`) -- Runs the heavy RPC queries server-side to avoid rate limits and slow client-side scans
2. **Caching Layer** -- Store aggregated results in a `tip_leaderboard_cache` database table, refreshed every 5 minutes
3. **Frontend Integration** -- Update the leaderboard to use on-chain data for Spent/Paid categories with real time-period deltas

## Implementation Steps

### Step 1: Database Table for Caching

Create a `tip_leaderboard_cache` table to store aggregated tip data:
- `wallet_address` (text) -- the tipper/recipient
- `chain_id` (int) -- 8453 or 56
- `sent_total` (numeric) -- total DHB sent as tips
- `received_total` (numeric) -- total DHB received as tips
- `period` (text) -- 'day', 'week', 'month', 'year', 'all'
- `updated_at` (timestamptz)
- Public read RLS policy (leaderboard is public data)

### Step 2: Edge Function -- `query-tip-history`

A backend function that:
1. Uses the Alchemy RPC (via the existing `ALCHEMY_API_KEY` secret) to query `Transfer` events on the DHB token contract
2. Calculates block ranges for each period (day = ~43,200 blocks on Base, week = ~302,400, etc.)
3. Aggregates sent/received totals per wallet address
4. Upserts results into `tip_leaderboard_cache`
5. Can be triggered on a schedule or on-demand

### Step 3: Update Leaderboard API Layer

Modify `src/lib/api/dehub/leaderboard.ts`:
- When `sort` is `sentTips` or `receivedTips`, query `tip_leaderboard_cache` instead of (or merged with) the DeHub API
- Support real delta calculations for day/week/month/year periods
- Fall back to the DeHub API if on-chain data isn't available yet

### Step 4: Update Leaderboard Page

Minor updates to `LeaderboardPage.tsx`:
- Show "On-chain verified" indicator for Spent/Paid categories
- Proper delta display for all time periods (currently only works when the API returns deltas)

## Technical Considerations

- **Block scanning depth**: Base produces ~1 block/2s, so 1 year is roughly 15.7M blocks. Alchemy supports large range queries but we may need to paginate.
- **Distinguishing tips from regular transfers**: Not all DHB transfers are tips. We could filter by looking at transfers where the `from` or `to` is a known DeHub user (cross-referenced with the leaderboard user list), or by checking if transfers go through a specific tipping contract.
- **Rate limits**: Running this server-side via the edge function (with the existing Alchemy key) avoids client-side rate limits.
- **Dual chain support**: Query both Base and BNB contracts, then merge the results.

