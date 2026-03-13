

# Add Top 100 Cryptos Page (Linked from Rank Badge)

## Overview
Make the CMC rank badge (e.g. "#69") in the cashtag price card clickable. Clicking it navigates to a new `/app/top-100` page showing the top 100 cryptocurrencies by market cap, fetched from the CMC API.

## Changes

### 1. New Edge Function: `supabase/functions/cmc-top-100/index.ts`
- Calls CMC `/v1/cryptocurrency/listings/latest?limit=100&convert=USD`
- Returns array of coins with: rank, name, symbol, price, market_cap, volume_24h, percent_change_24h, percent_change_7d
- Uses existing `CMC_API_KEY` secret

### 2. New Hook: `src/hooks/use-cmc-top-100.ts`
- Calls the edge function via `supabase.functions.invoke('cmc-top-100')`
- Caches for 5 minutes (`staleTime: 300_000`)

### 3. New Page: `src/pages/app/Top100CryptosPage.tsx`
- Scrollable table/list showing rank, symbol, name, price, 24h%, 7d%, market cap, volume
- Green/red coloring for percent changes
- Each row clickable → navigates to `/app/explore?q=$SYMBOL`
- Mobile-responsive (horizontal scroll for table)

### 4. Make Rank Badge Clickable in `CashtagPriceCard.tsx`
- Wrap the `#{cmcData.cmcRank}` span with a link/button that navigates to `/app/top-100`
- Add hover styling to indicate clickability

### 5. Register Route
- Add route in `App.tsx`: `<Route path="top-100" element={null} />`
- Add entry in `PersistentPageCache.tsx` for `/app/top-100`

