

## Plan: Improve Stock Logo Coverage

### Problem
The `TickerLogo` component already tries Synth Finance for stock logos, but many fail silently — resulting in letter-circle fallbacks for Netflix, Visa, Eli Lilly, etc.

### Solution
Add **Clearbit** (`logo.clearbit.com/{domain}`) as a second stock logo source. It's free, no API key, and has excellent coverage for public companies. We just need a symbol-to-domain mapping.

### Changes

**File: `src/components/app/TickerLogo.tsx`**

1. Add a `STOCK_DOMAINS` map for the ~35 assets in the Top Assets list:
   ```
   NFLX → netflix.com, V → visa.com, LLY → lilly.com,
   AMZN → amazon.com, NVDA → nvidia.com, META → meta.com,
   TSLA → tesla.com, WMT → walmart.com, XOM → exxonmobil.com,
   UNH → unitedhealthgroup.com, MA → mastercard.com,
   HD → homedepot.com, PG → pg.com, JNJ → jnj.com,
   COST → costco.com, ABBV → abbvie.com, BAC → bankofamerica.com,
   KO → coca-cola.com, CRM → salesforce.com, ORCL → oracle.com,
   NFLX → netflix.com, AMD → amd.com, etc.
   ```

2. Update the fallback chain: if Synth Finance fails, try `https://logo.clearbit.com/{domain}` before falling through to the letter fallback.

This means every stock in the Top Assets list will show a proper company logo — no API key needed, no edge function required.

### Why not the others?
- **Logo.dev** requires a token (even free tier)
- **Google Favicons** are low quality at 24px
- **Brandfetch** requires an API key
- **Clearbit** is free, no key, high quality, and covers all major public companies

