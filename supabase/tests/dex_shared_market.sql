-- Run after the migration. All observations made by this test are rolled back.
BEGIN;
DO $$
DECLARE value numeric := 123456789012345678901234567890; first_snapshot jsonb;
BEGIN
  IF dex_private.hex_number(dex_private.uint_hex(value)) <> value THEN RAISE EXCEPTION 'uint256 round trip'; END IF;
  IF dex_private.word('0x' || dex_private.uint_hex(7) || dex_private.uint_hex(19),1) <> 19 THEN RAISE EXCEPTION 'ABI offset'; END IF;
  IF has_function_privilege('anon','dex_private.sample_market()','EXECUTE') THEN RAISE EXCEPTION 'Public sampler access'; END IF;
  IF has_schema_privilege('anon','dex_private','USAGE') THEN RAISE EXCEPTION 'Private data exposed'; END IF;
  IF NOT has_function_privilege('anon','public.get_dex_market()','EXECUTE') THEN RAISE EXCEPTION 'Missing public cache read'; END IF;
  PERFORM dex_private.sample_market();
  first_snapshot := public.get_dex_market();
  PERFORM dex_private.sample_market();
  IF public.get_dex_market() IS DISTINCT FROM first_snapshot THEN RAISE EXCEPTION 'Repeated read resampled the minute'; END IF;
  IF NOT (first_snapshot->'candles' ?& ARRAY['1m','5m','15m','30m','1h']) THEN RAISE EXCEPTION 'Missing intervals'; END IF;
END $$;
SET LOCAL ROLE anon;
SELECT public.get_dex_market() IS NOT NULL AS anonymous_cache_read;
RESET ROLE;
ROLLBACK;

-- The edge sampler's two doors are service-role only, and a recorded minute is never rewritten.
BEGIN;
DO $$
DECLARE before jsonb; outcome jsonb;
BEGIN
  IF has_function_privilege('anon','public.record_dex_market_sample(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Public sample write'; END IF;
  IF has_function_privilege('anon','public.dex_market_sample_input(integer)','EXECUTE') THEN RAISE EXCEPTION 'Public sample input'; END IF;
  IF has_function_privilege('authenticated','public.record_dex_market_sample(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Signed-in sample write'; END IF;
  IF jsonb_typeof(public.dex_market_sample_input(10)->'rows') <> 'array' THEN RAISE EXCEPTION 'Sample input shape'; END IF;
  PERFORM dex_private.sample_market();
  before := public.get_dex_market();
  outcome := public.record_dex_market_sample(jsonb_build_object('observedAt', extract(epoch FROM now()), 'price', 0.002,
    'positions', '[]'::jsonb, 'usdPrice', 0.002, 'liquidityUsd', 1, 'lpDhb', 1, 'externalAsks', '[]'::jsonb, 'blocks', '{}'::jsonb, 'verified', '[]'::jsonb));
  IF (outcome->>'written')::boolean THEN RAISE EXCEPTION 'Recorded minute was rewritten'; END IF;
  IF public.get_dex_market() IS DISTINCT FROM before THEN RAISE EXCEPTION 'Refused sample changed the snapshot'; END IF;
  BEGIN
    PERFORM public.record_dex_market_sample('{"observedAt": 1, "positions": []}'::jsonb);
    RAISE EXCEPTION 'Stale sample accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Stale sample accepted' THEN RAISE; END IF;
  END;
  PERFORM dex_private.sample_market_fallback();
  IF public.get_dex_market() IS DISTINCT FROM before THEN RAISE EXCEPTION 'Fallback resampled a fresh snapshot'; END IF;
END $$;
ROLLBACK;
