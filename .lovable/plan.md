

## Fix: Talk of the Town 1D Fallback Behavior

**Problem**: When the `category_post_log` has fewer than 3 entries for a time period (1D, 1W, etc.), the code falls back to the aggregate "All" table, making it look like 1D stats are the same as All.

**Solution**: Remove the fallback — show actual time-filtered data even if sparse. If there are 0 results, show the empty/placeholder state instead of misleading aggregate data.

### Changes

**File: `src/hooks/use-trending-categories.ts`**
- Remove the `logData.length >= 3` fallback check
- Always use time-filtered log data for 1D/1W/1M/1Y periods
- Only use the aggregate table for the "All" period
- The `withTopTenPlaceholders` function already handles padding with `-` placeholders when fewer than 10 results exist

```typescript
// Before
computed = logData.length >= 3 ? logData : await fetchFromAggregateTable();

// After
computed = logData;
```

One-line change.

