ALTER TABLE public.affiliate_codes
  ADD COLUMN landing_ctas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT affiliate_codes_landing_ctas_check
    CHECK (jsonb_typeof(landing_ctas) = 'array' AND jsonb_array_length(landing_ctas) <= 5);

CREATE TABLE public.affiliate_cta_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  owner_address text NOT NULL,
  destination text NOT NULL,
  visitor_id text NOT NULL,
  clicked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_cta_clicks_owner_dest_idx ON public.affiliate_cta_clicks (owner_address, destination);
GRANT SELECT ON public.affiliate_cta_clicks TO anon, authenticated;
GRANT ALL ON public.affiliate_cta_clicks TO service_role;
ALTER TABLE public.affiliate_cta_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read affiliate cta clicks" ON public.affiliate_cta_clicks
  FOR SELECT USING (lower(owner_address) = get_request_wallet_address());

CREATE OR REPLACE FUNCTION public.record_affiliate_cta_click(p_code text, p_destination text, p_visitor_id text, p_viewer_address text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text := upper(trim(p_code));
  v_owner text;
  v_viewer text := lower(trim(coalesce(p_viewer_address, '')));
BEGIN
  IF p_visitor_id IS NULL OR char_length(p_visitor_id) < 8 OR char_length(p_visitor_id) > 80 THEN RETURN; END IF;
  IF p_destination IS NULL OR left(p_destination, 1) <> '/' OR char_length(p_destination) > 200 THEN RETURN; END IF;
  SELECT lower(owner_address) INTO v_owner FROM public.affiliate_codes
  WHERE code = v_code AND active = true LIMIT 1;
  IF v_owner IS NULL OR v_viewer = v_owner THEN RETURN; END IF;
  INSERT INTO public.affiliate_cta_clicks(code, owner_address, destination, visitor_id)
  VALUES (v_code, v_owner, p_destination, p_visitor_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_affiliate_cta_click(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_affiliate_cta_click(text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_affiliate_cta_stats()
RETURNS TABLE(destination text, clicks bigint, unique_visitors bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT c.destination, count(*), count(DISTINCT c.visitor_id)
  FROM public.affiliate_cta_clicks c GROUP BY c.destination ORDER BY 2 DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_affiliate_cta_stats() TO anon, authenticated;