

## Use CMC API for Chart Data (Replace CoinGecko)

### Problem
Charts currently use CoinGecko's free API, which rate-limits and breaks 90D/1Y timeframes. You're already paying for CMC API which has the `/v1/cryptocurrency/ohlcv/historical` endpoint.

### Plan

**1. Create `coingecko-chart` → `cmc-chart` edge function** (`supabase/functions/cmc-chart/index.ts`)
- Uses your existing `CMC_API_KEY` secret
- Endpoint: `POST { symbol, days }`
- Calls `https://pro-api.coinmarketcap.com/v1/cryptocurrency/ohlcv/historical` with:
  - `symbol` (cleaned)
  - `time_start` / `time_end` computed from `days` param
  - `interval`: `hourly` for 1D/7D, `daily` for 30D/90D/1Y
- Returns array of `{ time, price }` (using the `close` price from OHLCV)
- Downsamples to ~60 points for performance
- Add `verify_jwt = false` to config.toml

**2. Update `use-token-chart.ts`**
- Replace all CoinGecko fetch calls with `supabase.functions.invoke('cmc-chart', { body: { symbol, days } })`
- Remove CoinGecko platform mappings and contract-based fallback (CMC resolves by symbol directly)
- Keep the same `PricePoint` interface and downsampling

**3. Remove `ChartTimeframe` 'ALL' from type** (already handled as external link, just clean up the `TIMEFRAME_DAYS` map)

### Result
- All timeframes (1D through 1Y) use your paid CMC API — no rate limiting
- CoinGecko dependency fully removed from charts
- Edge function keeps API key server-side

