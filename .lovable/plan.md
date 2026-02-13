

## Replace Transfer Log Discovery with API-Based Profile Discovery

### What's happening now
The leaderboard refresh has two steps:
1. Ask the DeHub API for its "holdings leaderboard" list (incomplete -- not all users are on it)
2. Scan on-chain Transfer logs from the last ~23 days to find additional wallets

The Transfer log scan misses anyone who got their tokens more than 23 days ago. That's why "waifu" was missing even though they're searchable in the app.

### What we'll change
Replace the Transfer log scan with a smarter approach: **use the DeHub API to discover all registered users, then check their on-chain balances**.

### New discovery flow
1. Keep step 1 (DeHub holdings leaderboard) as the primary source
2. Keep EXTRA_WALLETS for manual overrides
3. **Replace** the Transfer log scan with: query the DeHub API search endpoint for registered accounts, then batch-check their on-chain DHB balances
4. Anyone with 10,000+ DHB gets added to the leaderboard

### How we find all users
The DeHub `/api/feed?type=accounts` endpoint supports search. We'll query it with common prefixes (a-z, 0-9) to pull a broad set of registered accounts, deduplicate them, filter out anyone already in the enriched list, then check their balances on-chain.

### Technical details

**File: `supabase/functions/refresh-leaderboard-cache/index.ts`**

1. **Replace `discoverOnChainHolders` with `discoverProfileHolders`**
   - New function queries the DeHub API search endpoint with alphabet prefixes (a-z, 0-9) to gather all registered accounts
   - Deduplicates results by wallet address
   - Filters out addresses already in the enriched list
   - Batch-queries on-chain balances for the remaining addresses
   - Returns entries with 10,000+ DHB as enriched leaderboard entries

2. **Remove Transfer log scanning code**
   - Remove `fetchTransferLogs` function
   - Remove `TRANSFER_TOPIC` constant
   - Remove the rolling-window block range logic

3. **Keep everything else the same**
   - EXTRA_WALLETS stays as a safety net
   - Historical block queries for time-period deltas stay unchanged
   - Snapshot logic stays unchanged

### Why this is better
- If someone is searchable in the app, they'll be found by the discovery scan
- No more time-window gaps -- we're scanning profiles, not Transfer logs
- Simpler code -- no block range math needed for discovery
- The DeHub API is the single source of truth for "who exists on the platform"

### Estimated API calls per refresh
- ~36 search queries (a-z + 0-9) to discover profiles
- Balance checks batched in groups of 10 with 200ms delays
- Well within rate limits for a function that runs every 5 minutes
