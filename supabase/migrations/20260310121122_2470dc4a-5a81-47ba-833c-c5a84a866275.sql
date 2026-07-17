
-- Individual search event log for time-period filtering
CREATE TABLE public.ticker_search_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  searched_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast time-range aggregation
CREATE INDEX idx_ticker_search_log_searched_at ON public.ticker_search_log (searched_at DESC);
CREATE INDEX idx_ticker_search_log_symbol ON public.ticker_search_log (symbol);

-- Enable RLS
ALTER TABLE public.ticker_search_log ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (fire-and-forget from client)
CREATE POLICY "Anyone can insert search logs" ON public.ticker_search_log
  FOR INSERT TO public WITH CHECK (true);

-- Anyone can read (for aggregation queries)
CREATE POLICY "Anyone can view search logs" ON public.ticker_search_log
  FOR SELECT TO public USING (true);
