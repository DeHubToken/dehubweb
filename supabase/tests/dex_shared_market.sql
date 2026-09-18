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
