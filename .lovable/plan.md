

# Fix: Inaccurate CMC Chart Timeframes

## Problem

The `cmc-chart` edge function has two bugs causing misleading charts:

1. **1D chart shows 7 days of data** — the code sets `effectiveDays = 7` for a 1-day request, so the chart displays a week-long price drop (~15%) instead of the actual daily change.
2. **7D chart shows 14 days** — same issue, `effectiveDays = 14` for 7-day requests.
3. **All intervals use `daily` candles** — for 1D, there's only ~1 completed daily candle, so the workaround was to pad with extra days. The real fix is to use `hourly` interval for short timeframes.

The original comment explains the intent: "CMC OHLCV historical only returns completed candles (daily). For 1D, show last 7 days so the chart isn't empty." But this makes the price change look wrong.

## Fix

In `supabase/functions/cmc-chart/index.ts`:

- **1D**: Use `interval: 'hourly'` and fetch exactly 1 day (24 hours). CMC's v2 OHLCV historical endpoint supports `hourly` intervals, giving ~24 data points for a proper intraday chart.
- **7D**: Use `interval: 'daily'` and fetch exactly 7 days (not 14).
- **30D+**: Keep `interval: 'daily'` with exact day count (no padding).
- Remove the `effectiveDays` override logic entirely.

### Technical Details

```
// Before:
const effectiveDays = days <= 1 ? 7 : days <= 7 ? 14 : days;
const interval = 'daily';

// After:
const effectiveDays = days;
const interval = days <= 1 ? 'hourly' : 'daily';
```

Single file change: `supabase/functions/cmc-chart/index.ts` (lines 51-62).

