-- lovable-cron-fallback-reviewed: the /dex snapshot must be rebuilt every minute; positions and pool state only change on-chain and can only be observed by reading it.
-- Move the once-a-minute DEX sample out of plpgsql and into the dex-market-sample
-- edge function.
--
-- dex_private.sample_market() read every position with one HTTP call per read,
-- sequentially, from inside Postgres, over public RPCs, and threw the whole
-- minute away if it ran long. The edge function reads a chain in one Multicall3
-- call with the Alchemy key and hands the finished sample here. This migration
-- gives it the two doors it needs — one to read its input, one to record the
-- result — and keeps the SQL sampler as a fallback that only fires when the
-- function has not written for ninety seconds.
--
-- Nothing the clients read changes: price_minutes, the candles, market_state
-- and the heartbeat trigger are written exactly as sample_market() wrote them.

-- Mint receipts are immutable. Once an app-indexed row has proven its owner's
-- mint, remember it so the sampler never fetches that receipt again.
CREATE TABLE IF NOT EXISTS dex_private.verified_mints (
  chain_id integer NOT NULL,
  token_id text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, token_id)
);
ALTER TABLE dex_private.verified_mints ENABLE ROW LEVEL SECURITY;

-- Everything the sampler needs in one read: app rows with their verification
-- state, the newest discovered rows the app never wrote, and when the last
-- snapshot was taken so a fresh one is not redone on demand.
CREATE OR REPLACE FUNCTION public.dex_market_sample_input(p_max_discovered integer DEFAULT 500)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object(
    'observedAt', (SELECT (payload->>'observedAt')::numeric FROM dex_private.market_state WHERE id),
    'rows', coalesce((
      SELECT jsonb_agg(to_jsonb(source) ORDER BY source.chain_id, source.token_id) FROM (
        SELECT s.chain_id, s.token_id, s.owner_address, s.mint_tx_hash, s.created_at, s.side,
               s.dhb_amount, s.usdc_amount, s.min_usdc_per_dhb, s.max_usdc_per_dhb,
               true AS app_indexed, (v.token_id IS NOT NULL) AS verified
          FROM public.dex_sell_positions s
          LEFT JOIN dex_private.verified_mints v ON v.chain_id = s.chain_id AND v.token_id = s.token_id
        UNION ALL
        SELECT * FROM (
          SELECT d.chain_id, d.token_id, NULL::text, d.mint_tx_hash, d.created_at, NULL::text,
                 NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, false, true
            FROM public.dex_pool_positions d
           WHERE NOT EXISTS (SELECT 1 FROM public.dex_sell_positions s WHERE s.chain_id = d.chain_id AND s.token_id = d.token_id)
           ORDER BY d.created_at DESC LIMIT greatest(0, least(p_max_discovered, 2000))
        ) outside
      ) source), '[]'::jsonb)
  )
$$;
REVOKE ALL ON FUNCTION public.dex_market_sample_input(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dex_market_sample_input(integer) TO service_role;

-- Record one finished sample. Idempotent per clock minute: the fallback and
-- the function can both arrive for the same minute and only the first lands.
CREATE OR REPLACE FUNCTION public.record_dex_market_sample(p_sample jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  sample_minute timestamptz := date_trunc('minute', now());
  observed timestamptz := to_timestamp((p_sample->>'observedAt')::numeric);
  best numeric := (p_sample->>'price')::numeric;
  usd_now numeric := (p_sample->>'usdPrice')::numeric;
  liquidity_now numeric := (p_sample->>'liquidityUsd')::numeric;
  positions jsonb := coalesce(p_sample->'positions', '[]'::jsonb);
  candle_sets jsonb := '{}'; candles jsonb; interval_label text; seconds integer;
  started timestamptz; previous_price numeric;
BEGIN
  IF NOT pg_try_advisory_xact_lock(618031901) THEN RETURN jsonb_build_object('written', false, 'reason', 'busy'); END IF;
  IF jsonb_typeof(positions) <> 'array' OR observed IS NULL THEN RAISE EXCEPTION 'Malformed sample'; END IF;
  IF observed < sample_minute - interval '1 minute' OR observed > now() + interval '1 minute' THEN RAISE EXCEPTION 'Sample time out of range'; END IF;
  IF NOT (usd_now > 0) THEN usd_now := NULL; END IF;
  IF NOT (best > 0) THEN best := NULL; END IF;
  INSERT INTO dex_private.verified_mints (chain_id, token_id)
    SELECT (v->>'chain_id')::integer, v->>'token_id' FROM jsonb_array_elements(coalesce(p_sample->'verified', '[]'::jsonb)) v
    WHERE (v->>'token_id') ~ '^[1-9][0-9]*$' AND (v->>'chain_id')::integer IN (56, 8453)
  ON CONFLICT DO NOTHING;
  IF EXISTS (SELECT 1 FROM dex_private.price_minutes WHERE minute = sample_minute) THEN
    RETURN jsonb_build_object('written', false, 'reason', 'minute recorded');
  END IF;
  SELECT started_at INTO started FROM dex_private.market_state WHERE id;
  INSERT INTO dex_private.price_minutes(minute, observed_at, price, positions, usd_price, liquidity_usd)
    VALUES (sample_minute, observed, best, positions, usd_now, liquidity_now);
  FOR interval_label, seconds IN SELECT * FROM (VALUES ('1m',60),('5m',300),('15m',900),('30m',1800),('1h',3600)) v(label, seconds) LOOP
    WITH grouped AS (
      SELECT floor(extract(epoch FROM minute)/seconds)*seconds AS time,
        (array_agg(usd_price ORDER BY minute))[1] AS open, max(usd_price) AS high, min(usd_price) AS low,
        (array_agg(usd_price ORDER BY minute DESC))[1] AS close, max(extract(epoch FROM observed_at)) AS "observedAt"
      FROM dex_private.price_minutes
      WHERE minute >= sample_minute - make_interval(secs => seconds*120) AND usd_price IS NOT NULL
      GROUP BY 1 ORDER BY 1 DESC LIMIT 120
    ) SELECT coalesce(jsonb_agg(to_jsonb(grouped) ORDER BY time), '[]'::jsonb) INTO candles FROM grouped;
    candle_sets := candle_sets || jsonb_build_object(interval_label, candles);
  END LOOP;
  SELECT usd_price INTO previous_price FROM dex_private.price_minutes
    WHERE minute <= sample_minute - interval '24 hours' AND usd_price IS NOT NULL ORDER BY minute DESC LIMIT 1;
  UPDATE dex_private.market_state SET payload = jsonb_build_object('version', 1, 'startedAt', extract(epoch FROM started),
    'observedAt', extract(epoch FROM observed), 'price', best, 'positions', positions, 'candles', candle_sets,
    'blocks', coalesce(p_sample->'blocks', '{}'::jsonb),
    'usdPrice', usd_now, 'liquidityUsd', liquidity_now, 'lpDhb', (p_sample->>'lpDhb')::numeric,
    'externalAsks', coalesce(p_sample->'externalAsks', '[]'::jsonb),
    'change24h', CASE WHEN previous_price > 0 AND usd_now IS NOT NULL THEN (usd_now/previous_price-1)*100 ELSE NULL END) WHERE id;
  RETURN jsonb_build_object('written', true, 'minute', sample_minute, 'positions', jsonb_array_length(positions));
END $$;
REVOKE ALL ON FUNCTION public.record_dex_market_sample(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_dex_market_sample(jsonb) TO service_role;

-- The SQL sampler only steps in when the function has gone quiet.
CREATE OR REPLACE FUNCTION dex_private.sample_market_fallback()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE last_observed numeric;
BEGIN
  SELECT (payload->>'observedAt')::numeric INTO last_observed FROM dex_private.market_state WHERE id;
  IF last_observed IS NOT NULL AND last_observed > extract(epoch FROM now()) - 90 THEN RETURN; END IF;
  PERFORM dex_private.sample_market();
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA dex_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA dex_private FROM PUBLIC, anon, authenticated;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dex-shared-minute-price') THEN
    PERFORM cron.unschedule('dex-shared-minute-price');
  END IF;
  PERFORM cron.schedule('dex-shared-minute-price', '* * * * *', 'SELECT dex_private.sample_market_fallback();');
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dex-market-sample') THEN
    PERFORM cron.unschedule('dex-market-sample');
  END IF;
  PERFORM cron.schedule(
    'dex-market-sample',
    '* * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/dex-market-sample',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
      );
    $job$
  );
END $do$;
