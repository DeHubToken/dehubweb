CREATE TABLE public.ai_provider_usage_daily (
  day date NOT NULL,
  feature text NOT NULL CHECK (length(feature) BETWEEN 1 AND 100),
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 100),
  route text NOT NULL CHECK (route IN ('free', 'direct', 'gateway')),
  requested_model text NOT NULL CHECK (length(requested_model) BETWEEN 1 AND 100),
  served_model text NOT NULL CHECK (length(served_model) BETWEEN 1 AND 100),
  outcome text NOT NULL CHECK (length(outcome) BETWEEN 1 AND 100),
  fallback_reason text NOT NULL CHECK (length(fallback_reason) BETWEEN 1 AND 100),
  http_status integer NOT NULL CHECK (http_status BETWEEN 0 AND 599),
  attempts bigint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  usage_reports bigint NOT NULL DEFAULT 0 CHECK (usage_reports >= 0),
  usage_missing bigint NOT NULL DEFAULT 0 CHECK (usage_missing >= 0),
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cached_tokens bigint NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
  reasoning_tokens bigint NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  elapsed_ms bigint NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, feature, provider, route, requested_model, served_model, outcome, fallback_reason, http_status)
);

ALTER TABLE public.ai_provider_usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_provider_usage_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_provider_usage_daily TO service_role;

CREATE FUNCTION public.record_ai_provider_usage(p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) > 32 THEN
    RAISE EXCEPTION 'Expected at most 32 provider attempts';
  END IF;
  INSERT INTO public.ai_provider_usage_daily AS totals (
    day, feature, provider, route, requested_model, served_model, outcome, fallback_reason, http_status,
    attempts, usage_reports, usage_missing, input_tokens, output_tokens, cached_tokens, reasoning_tokens, elapsed_ms
  )
  SELECT day, feature, provider, route, requested_model, served_model, outcome, fallback_reason, http_status,
    count(*), count(*) FILTER (WHERE usage_reported), count(*) FILTER (WHERE NOT usage_reported),
    sum(input_tokens), sum(output_tokens), sum(cached_tokens), sum(reasoning_tokens), sum(elapsed_ms)
  FROM jsonb_to_recordset(p_rows) AS entry (
    day date, feature text, provider text, route text, requested_model text, served_model text,
    outcome text, fallback_reason text, http_status integer, usage_reported boolean,
    input_tokens bigint, output_tokens bigint, cached_tokens bigint, reasoning_tokens bigint, elapsed_ms bigint
  )
  GROUP BY day, feature, provider, route, requested_model, served_model, outcome, fallback_reason, http_status
  ON CONFLICT (day, feature, provider, route, requested_model, served_model, outcome, fallback_reason, http_status)
  DO UPDATE SET
    attempts = totals.attempts + EXCLUDED.attempts,
    usage_reports = totals.usage_reports + EXCLUDED.usage_reports,
    usage_missing = totals.usage_missing + EXCLUDED.usage_missing,
    input_tokens = totals.input_tokens + EXCLUDED.input_tokens,
    output_tokens = totals.output_tokens + EXCLUDED.output_tokens,
    cached_tokens = totals.cached_tokens + EXCLUDED.cached_tokens,
    reasoning_tokens = totals.reasoning_tokens + EXCLUDED.reasoning_tokens,
    elapsed_ms = totals.elapsed_ms + EXCLUDED.elapsed_ms,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_provider_usage(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_provider_usage(jsonb) TO service_role;

COMMENT ON TABLE public.ai_provider_usage_daily IS
'Provider-reported token counters and attempt coverage. Missing usage is unknown spend; no prompt, answer, wallet or credential data is stored. Route names do not imply free billing.';
