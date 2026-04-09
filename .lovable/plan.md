

## Problems Identified

1. **Only 12 traditional assets hardcoded** — the list stops at JPMorgan because that's all that was added to `TOP_ASSETS` in `use-top-assets.ts`. There are ~100 crypto from CMC but only 12 stocks/commodities.

2. **Logos use Clearbit URLs** which are unreliable (many return broken images or 404s). The project already has a battle-tested `TickerLogo` component that chains Synth Finance, CoinGecko, and DexScreener with proper fallbacks — but it's not being used for stock/commodity rows.

3. **Each asset fires a separate `stock-quote` edge function call** — with 12 assets that's 12 calls. Expanding to 30+ would mean 30+ sequential Yahoo Finance proxy calls, which is slow and wasteful.

## Plan

### 1. Expand the asset list to ~30 top global assets

Add these to the `TOP_ASSETS` array in `use-top-assets.ts`:

- **Commodities**: Gold, Silver, Crude Oil, Natural Gas, Copper, Platinum
- **Mega-cap stocks**: NVDA, AAPL, MSFT, GOOGL, AMZN, META, TSLA, BRK-B, TSM, AVGO, LLY, WMT, JPM, V, MA, UNH, XOM, JNJ, PG, HD, COST, NFLX, ORCL, CRM, AMD, PEP, KO, INTC, BA

Each with a `fallbackMarketCap` so sorting always works even if Yahoo returns null.

### 2. Replace Clearbit logos with TickerLogo component

Stop using `logoUrl` strings. Instead, render `<TickerLogo symbol={asset.symbol} size={24} />` for all stock/commodity rows. This uses Synth Finance (which has proper stock logos for AAPL, MSFT, etc.) with CoinGecko/DexScreener fallbacks. Keep the custom Gold (Au) and Silver (Ag) gradient icons for commodities.

### 3. Batch the Yahoo Finance calls via a single edge function

Create/update the `top-assets` edge function to accept an array of symbols and fetch them all in one Yahoo Finance multi-quote API call (`v7/finance/quote?symbols=AAPL,MSFT,...`). This reduces ~30 individual edge function invocations to 1 call, making the page load much faster.

### Files Changed

| File | Change |
|------|--------|
| `src/hooks/use-top-assets.ts` | Expand to ~30 assets, remove `logoUrl`, call single batch function |
| `src/pages/app/Top100CryptosPage.tsx` | Use `TickerLogo` for stock rows instead of Clearbit `<img>` |
| `supabase/functions/top-assets/index.ts` | Rewrite to batch-fetch all symbols in one Yahoo Finance call |

