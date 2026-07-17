
CREATE OR REPLACE FUNCTION public.increment_ticker_search(p_symbol TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ticker_searches (symbol, search_count, last_searched_at)
  VALUES (UPPER(p_symbol), 1, now())
  ON CONFLICT (symbol)
  DO UPDATE SET
    search_count = ticker_searches.search_count + 1,
    last_searched_at = now();
END;
$$;
