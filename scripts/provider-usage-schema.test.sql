BEGIN;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.ai_provider_usage_daily', 'SELECT')
    OR has_table_privilege('authenticated', 'public.ai_provider_usage_daily', 'SELECT')
    OR has_function_privilege('anon', 'public.record_ai_provider_usage(jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.record_ai_provider_usage(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Public access to provider accounting';
  END IF;
END;
$$;

SELECT public.record_ai_provider_usage('[{"day":"2026-10-06","feature":"fixture","provider":"google","route":"direct","requested_model":"pro","served_model":"pro","outcome":"accepted","fallback_reason":"none","http_status":200,"usage_reported":true,"input_tokens":12,"output_tokens":7,"cached_tokens":3,"reasoning_tokens":2,"elapsed_ms":50}, {"day":"2026-10-06","feature":"fixture","provider":"google","route":"direct","requested_model":"pro","served_model":"pro","outcome":"accepted","fallback_reason":"none","http_status":200,"usage_reported":false,"input_tokens":0,"output_tokens":0,"cached_tokens":0,"reasoning_tokens":0,"elapsed_ms":10}]');
SELECT public.record_ai_provider_usage('[{"day":"2026-10-06","feature":"fixture","provider":"google","route":"direct","requested_model":"pro","served_model":"pro","outcome":"accepted","fallback_reason":"none","http_status":200,"usage_reported":true,"input_tokens":12,"output_tokens":7,"cached_tokens":3,"reasoning_tokens":2,"elapsed_ms":50}]');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ai_provider_usage_daily WHERE feature='fixture'
    AND attempts=3 AND usage_reports=2 AND usage_missing=1 AND input_tokens=24 AND output_tokens=14
    AND cached_tokens=6 AND reasoning_tokens=4 AND elapsed_ms=110) THEN
    RAISE EXCEPTION 'Provider counters or usage coverage did not aggregate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.ai_provider_usage_daily'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'Provider accounting RLS is disabled';
  END IF;
END;
$$;
ROLLBACK;
