-- Multiple destinations on an affiliate invite page.
--
-- landing_ctas holds up to five extra buttons ({label, destination}) shown
-- beside the main one. Clicks are counted per destination so an affiliate can
-- see which part of DeHub their audience actually wants.

ALTER TABLE public.affiliate_codes
  ADD COLUMN IF NOT EXISTS landing_ctas jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.affiliate_codes
  DROP CONSTRAINT IF EXISTS affiliate_codes_landing_ctas_check;
ALTER TABLE public.affiliate_codes
  ADD CONSTRAINT affiliate_codes_landing_ctas_check
  CHECK (jsonb_typeof(landing_ctas) = 'array' AND jsonb_array_length(landing_ctas) <= 5);

CREATE TABLE IF NOT EXISTS public.affiliate_cta_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  owner_address text NOT NULL,
  destination text NOT NULL,
  visitor_id text NOT NULL,
  clicked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_cta_clicks_owner_dest_idx
  ON public.affiliate_cta_clicks (owner_address, destination);

ALTER TABLE public.affiliate_cta_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read own cta clicks" ON public.affiliate_cta_clicks;
CREATE POLICY "Owners read own cta clicks"
  ON public.affiliate_cta_clicks FOR SELECT
  USING (lower(owner_address) = public.get_request_wallet_address());

CREATE OR REPLACE FUNCTION public.record_affiliate_cta_click(
  p_code text,
  p_destination text,
  p_visitor_id text,
  p_viewer_address text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text := upper(trim(p_code));
  v_dest text := trim(coalesce(p_destination, ''));
  v_owner text;
  v_viewer text := lower(trim(coalesce(p_viewer_address, '')));
BEGIN
  IF p_visitor_id IS NULL OR char_length(p_visitor_id) < 8 OR char_length(p_visitor_id) > 80 THEN
    RETURN;
  END IF;
  IF left(v_dest, 1) <> '/' OR left(v_dest, 2) = '//' OR char_length(v_dest) > 200 THEN
    RETURN;
  END IF;

  SELECT lower(owner_address) INTO v_owner
  FROM public.affiliate_codes
  WHERE code = v_code AND active = true
  LIMIT 1;

  IF v_owner IS NULL OR v_viewer = v_owner THEN RETURN; END IF;

  INSERT INTO public.affiliate_cta_clicks (code, owner_address, destination, visitor_id)
  VALUES (v_code, v_owner, v_dest, p_visitor_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_affiliate_cta_click(text, text, text, text) TO anon, authenticated;

-- Invoker rights on purpose: RLS scopes the rows to the caller's wallet,
-- exactly like get_affiliate_page_stats.
CREATE OR REPLACE FUNCTION public.get_affiliate_cta_stats()
RETURNS TABLE (destination text, clicks bigint, unique_visitors bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT destination, count(*)::bigint, count(DISTINCT visitor_id)::bigint
  FROM public.affiliate_cta_clicks
  GROUP BY destination
  ORDER BY 2 DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_affiliate_cta_stats() TO anon, authenticated;
