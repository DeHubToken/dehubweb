

# Update Daily and Weekly Topics Stats

## Problem
The `trending_categories` table only stores cumulative all-time counts. The `useTrendingCategories` hook ignores the period parameter and returns the same data for all time filters (1D, 1W, 1M, 1Y, All). The comment in code confirms: *"Time-period filtering can be added later with a created_at column."*

## Solution
Mirror the pattern already used for tickers (`ticker_search_log`): add a per-event log table for category posts, then aggregate from it for short time periods.

### 1. Database Migration
Create a `category_post_log` table:
```sql
CREATE TABLE public.category_post_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.category_post_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert" ON public.category_post_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view" ON public.category_post_log FOR SELECT USING (true);
CREATE INDEX idx_category_post_log_posted_at ON public.category_post_log (posted_at DESC);
```

Update the `increment_category_count` DB function to also insert into the log:
```sql
CREATE OR REPLACE FUNCTION public.increment_category_count(p_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.trending_categories (name, post_count, updated_at)
  VALUES (LOWER(TRIM(p_name)), 1, now())
  ON CONFLICT (name) DO UPDATE SET
    post_count = trending_categories.post_count + 1, updated_at = now();
  INSERT INTO public.category_post_log (name) VALUES (LOWER(TRIM(p_name)));
END;
$$;
```

### 2. Update Hook (`src/hooks/use-trending-categories.ts`)
- For **1d** and **1w**: query `category_post_log` filtered by `posted_at >= cutoff`, aggregate client-side (same pattern as `getTopTickers` in `ticker-search-tracker.ts`)
- For **1m, 1y, all**: continue using the cumulative `trending_categories` table

### 3. Update Hardcoded Fallbacks
Refresh the `1d` and `1w` hardcoded data entries to be more current/reasonable defaults, since the existing ones are stale snapshots.

No component changes needed -- the UI already passes the period to the hook correctly.

