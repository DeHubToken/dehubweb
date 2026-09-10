ALTER TABLE public.affiliate_codes
  ADD COLUMN IF NOT EXISTS landing_headline TEXT,
  ADD COLUMN IF NOT EXISTS landing_message TEXT,
  ADD COLUMN IF NOT EXISTS landing_cta_label TEXT,
  ADD COLUMN IF NOT EXISTS landing_destination TEXT;

ALTER TABLE public.affiliate_codes
  DROP CONSTRAINT IF EXISTS affiliate_codes_landing_headline_length,
  ADD CONSTRAINT affiliate_codes_landing_headline_length CHECK (char_length(landing_headline) <= 80),
  DROP CONSTRAINT IF EXISTS affiliate_codes_landing_message_length,
  ADD CONSTRAINT affiliate_codes_landing_message_length CHECK (char_length(landing_message) <= 280),
  DROP CONSTRAINT IF EXISTS affiliate_codes_landing_cta_label_length,
  ADD CONSTRAINT affiliate_codes_landing_cta_label_length CHECK (char_length(landing_cta_label) <= 32),
  DROP CONSTRAINT IF EXISTS affiliate_codes_landing_destination_safe,
  ADD CONSTRAINT affiliate_codes_landing_destination_safe CHECK (
    landing_destination IS NULL OR (
      char_length(landing_destination) <= 200
      AND landing_destination LIKE '/%'
      AND landing_destination NOT LIKE '//%'
      AND landing_destination NOT LIKE '/r/%'
    )
  );

CREATE TABLE IF NOT EXISTS public.affiliate_page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL REFERENCES public.affiliate_codes(code) ON DELETE CASCADE,
  owner_address TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  source TEXT,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS affiliate_page_views_owner_idx
  ON public.affiliate_page_views(lower(owner_address), viewed_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_page_views_code_idx
  ON public.affiliate_page_views(code, viewed_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_page_views_unique_idx
  ON public.affiliate_page_views(code, visitor_id);

ALTER TABLE public.affiliate_page_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.affiliate_page_views FROM anon, authenticated;
GRANT SELECT ON public.affiliate_page_views TO authenticated, anon;
GRANT ALL ON public.affiliate_page_views TO service_role;

DROP POLICY IF EXISTS "Owners read affiliate page views" ON public.affiliate_page_views;
CREATE POLICY "Owners read affiliate page views"
  ON public.affiliate_page_views FOR SELECT
  USING (lower(owner_address) = public.get_request_wallet_address());

CREATE OR REPLACE FUNCTION public.record_affiliate_page_view(
  p_code TEXT,
  p_visitor_id TEXT,
  p_source TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner TEXT;
BEGIN
  IF p_visitor_id IS NULL OR char_length(p_visitor_id) < 8 OR char_length(p_visitor_id) > 80 THEN
    RETURN;
  END IF;

  SELECT lower(owner_address) INTO v_owner
  FROM public.affiliate_codes
  WHERE code = upper(trim(p_code)) AND active = true
  LIMIT 1;

  IF v_owner IS NULL THEN RETURN; END IF;

  INSERT INTO public.affiliate_page_views(code, owner_address, visitor_id, source)
  VALUES (upper(trim(p_code)), v_owner, p_visitor_id, left(nullif(trim(p_source), ''), 120));
END;
$$;

REVOKE ALL ON FUNCTION public.record_affiliate_page_view(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_affiliate_page_view(TEXT, TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_affiliate_page_stats()
RETURNS TABLE(total_views BIGINT, unique_visitors BIGINT, views_30d BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint,
    count(DISTINCT visitor_id)::bigint,
    count(*) FILTER (WHERE viewed_at >= now() - interval '30 days')::bigint
  FROM public.affiliate_page_views;
$$;

REVOKE ALL ON FUNCTION public.get_affiliate_page_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_affiliate_page_stats() TO anon, authenticated;
