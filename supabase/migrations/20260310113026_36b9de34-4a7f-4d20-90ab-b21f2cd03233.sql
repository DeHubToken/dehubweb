
CREATE TABLE public.ticker_searches (
  symbol TEXT NOT NULL PRIMARY KEY,
  search_count INTEGER NOT NULL DEFAULT 1,
  last_searched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ticker_searches ENABLE ROW LEVEL SECURITY;

-- Anyone can read trending tickers
CREATE POLICY "Anyone can view ticker searches"
  ON public.ticker_searches FOR SELECT
  TO public
  USING (true);

-- Anyone can insert (upsert handled via ON CONFLICT)
CREATE POLICY "Anyone can insert ticker searches"
  ON public.ticker_searches FOR INSERT
  TO public
  WITH CHECK (true);

-- Anyone can update count
CREATE POLICY "Anyone can update ticker searches"
  ON public.ticker_searches FOR UPDATE
  TO public
  USING (true);
