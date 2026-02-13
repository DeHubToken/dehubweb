

# Fix: Wrong BNB DHB Token Address + Add Block Chunking

## Problem
The BNB DHB **token** address (used for querying Transfer event logs) is wrong in both tip/earning edge functions. Currently `0x680d3113caf77b61b510f332d5ef4cf5b41a761d` -- should be `0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7`. This means all BNB Transfer event queries return nothing.

Additionally, no block-range chunking exists, so long-period queries (month/year) exceed RPC limits and silently fail.

## Changes (only 2 files)

### 1. `supabase/functions/backfill-tip-snapshots/index.ts`
- Fix `DHB_BNB` on line 11 to `0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7`
- Add chunked log fetching: BNB = 5,000-block chunks, Base = 50,000-block chunks
- Add optional `?period=day|week|month|year` query param to run one period at a time (avoids timeouts)

### 2. `supabase/functions/refresh-leaderboard-cache/index.ts`
- Fix `DHB_BNB` on line 11 to `0x680d3113cAF77B61b510967F4433D2EdFbBC6cD7`

Nothing else is touched.

