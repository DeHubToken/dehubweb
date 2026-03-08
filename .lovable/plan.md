

## Plan: Add Stock Cashtag Support

### How It Works

**Resolution order**: When a user searches `$AAPL`, we check stocks first (Yahoo Finance). If a stock is found on a major exchange, show the stock card. If not found as a stock, fall back to crypto (DexScreener + CMC).

### New Components & Files

**1. Edge Function: `supabase/functions/stock-quote/index.ts`**
- Proxies Yahoo Finance v8 quote API (`query1.finance.yahoo.com/v8/finance/chart/{symbol}`)
- Accepts `{ symbol }` in the body
- Returns: `{ found, name, symbol, exchange, price, change24h, percentChange24h, marketCap, volume24h, previousClose, dayHigh, dayLow, currency, chartData[] }`
- Also fetches 1-day chart data (1m or 5m intervals) in the same call so we don't need a separate chart endpoint
- No API key needed (Yahoo Finance unofficial API)

**2. Hook: `src/hooks/use-stock-quote.ts`**
- Calls the edge function via `supabase.functions.invoke('stock-quote', { body: { symbol } })`
- Only enabled when query starts with `$` and has 1-5 letter symbol (stock tickers are short)
- Returns `StockQuote` type with price, change, market cap, volume, chart data, exchange info

**3. Component: `src/components/app/StockPriceCard.tsx`**
- Similar layout to `CashtagPriceCard` but styled for stocks
- Shows exchange badge (NYSE, NASDAQ, etc.) instead of chain ID
- Uses the same `TokenPriceChart` component for the chart (same `PricePoint[]` format)
- Shows: price, 24h change, market cap, volume, day high/low, currency
- Links to Yahoo Finance instead of DexScreener
- No "Copy CA" button (stocks don't have contract addresses)

### Changes to Existing Files

**4. `src/pages/app/ExplorePage.tsx`**
- Import and call `useStockQuote(effectiveQuery, isSearching)` 
- Resolution logic:
  - If `stockData?.found` → render `<StockPriceCard />` (stock takes priority)
  - Else if `dexPair` → render `<CashtagPriceCard />` (crypto fallback)
- Both hooks fire in parallel; we just pick which card to show based on results

### Key Design Decisions

- **Stocks first**: Yahoo Finance is checked first. If it returns a valid quote from a recognized exchange, we show the stock card. Otherwise, crypto.
- **No new API key needed**: Yahoo Finance's unofficial API is free and keyless.
- **Edge function proxy**: Avoids CORS issues from calling Yahoo directly from the browser.
- **Reuses `TokenPriceChart`**: The chart component already accepts `PricePoint[]`, so stock intraday data maps directly to it.
- **Global exchanges**: Yahoo Finance covers NYSE, NASDAQ, LSE, TSE, HKEX, etc. natively — no filtering needed on our end.

