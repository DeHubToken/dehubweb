-- Affiliate owners often open their own link to test it. Those visits are
-- useful for testing but must not inflate their campaign analytics.

-- Earlier writes used a plain index despite the intended one-visitor-per-code
-- behaviour. Keep the first arrival before making that intent enforceable.
DELETE FROM public.affiliate_page_views
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
      row_number() OVER (PARTITION BY code, visitor_id ORDER BY viewed_at, id) AS row_number
    FROM public.affiliate_page_views
  ) duplicates
  WHERE duplicates.row_number > 1
);

DROP INDEX IF EXISTS public.affiliate_page_views_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_page_views_unique_idx
  ON public.affiliate_page_views(code, visitor_id);

CREATE OR REPLACE FUNCTION public.record_affiliate_page_view(
  p_code TEXT,
  p_visitor_id TEXT,
  p_source TEXT,
  p_viewer_address TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := upper(trim(p_code));
  v_owner TEXT;
  v_viewer TEXT := lower(trim(coalesce(p_viewer_address, '')));
BEGIN
  IF p_visitor_id IS NULL OR char_length(p_visitor_id) < 8 OR char_length(p_visitor_id) > 80 THEN
    RETURN;
  END IF;

  SELECT lower(owner_address) INTO v_owner
  FROM public.affiliate_codes
  WHERE code = v_code AND active = true
  LIMIT 1;

  IF v_owner IS NULL THEN RETURN; END IF;

  -- A signed-in owner is testing their own link. Remove an arrival that may
  -- have been written before their session finished restoring, then stop.
  IF v_viewer = v_owner THEN
    DELETE FROM public.affiliate_page_views
    WHERE code = v_code AND visitor_id = p_visitor_id;
    RETURN;
  END IF;

  INSERT INTO public.affiliate_page_views(code, owner_address, visitor_id, source)
  VALUES (v_code, v_owner, p_visitor_id, left(nullif(trim(p_source), ''), 120))
  ON CONFLICT (code, visitor_id) DO NOTHING;
END;
$$;

-- Keep the three-argument RPC for old app versions. New clients pass their
-- signed-in address through the four-argument form above.
CREATE OR REPLACE FUNCTION public.record_affiliate_page_view(
  p_code TEXT,
  p_visitor_id TEXT,
  p_source TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.record_affiliate_page_view(p_code, p_visitor_id, p_source, NULL);
$$;

REVOKE ALL ON FUNCTION public.record_affiliate_page_view(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_affiliate_page_view(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_affiliate_page_view(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_affiliate_page_view(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
