-- Price, candles and depth for the DeHub Base DHB/USDC pool only.
-- Both the edge sampler and SQL fallback write these tables. Normalize at
-- that boundary so neither writer can reintroduce an outside pool's quote.
ALTER TABLE dex_private.price_minutes ADD COLUMN IF NOT EXISTS market_scope text;

CREATE OR REPLACE FUNCTION dex_private.dehub_pool_metrics(positions jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $fn$
  WITH own AS (
    SELECT p FROM jsonb_array_elements(coalesce(positions, '[]'::jsonb)) p
    WHERE p->>'chain_id' = '8453' AND p->>'poolFee' = '0' AND p->>'tickSpacing' = '1'
  )
  SELECT jsonb_build_object(
    'marketScope', 'base-dhb-usdc-0-1',
    'poolId', '0x9c07d4b06fd20498a3cacb80610b55dbbb7b3d79df07db20caccecc4e65155ec',
    'usdPrice', min((p->>'marketPrice')::numeric) FILTER (WHERE (p->>'marketPrice')::numeric > 0),
    'price', min(greatest((p->>'minPrice')::numeric, (p->>'marketPrice')::numeric)) FILTER (
      WHERE p->>'side' = 'sell' AND (p->>'amountDhb')::numeric > 1e-9
        AND greatest((p->>'minPrice')::numeric, (p->>'marketPrice')::numeric) < (p->>'maxPrice')::numeric),
    'liquidityUsd', coalesce(sum((p->>'amountUsdc')::numeric), 0),
    'lpDhb', coalesce(sum((p->>'amountDhb')::numeric), 0),
    'externalAsks', '[]'::jsonb
  ) FROM own
$fn$;
REVOKE ALL ON FUNCTION dex_private.dehub_pool_metrics(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION dex_private.dehub_pool_minute()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE metrics jsonb;
BEGIN
  metrics := dex_private.dehub_pool_metrics(NEW.positions);
  NEW.price := (metrics->>'price')::numeric;
  NEW.usd_price := (metrics->>'usdPrice')::numeric;
  NEW.liquidity_usd := (metrics->>'liquidityUsd')::numeric;
  NEW.market_scope := metrics->>'marketScope';
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION dex_private.dehub_pool_minute() FROM PUBLIC, anon, authenticated;
-- PostgreSQL runs same-event triggers alphabetically: this must run before
-- price_minutes_strip_positions removes the transient position payload.
CREATE TRIGGER dehub_pool_minute BEFORE INSERT ON dex_private.price_minutes
  FOR EACH ROW EXECUTE FUNCTION dex_private.dehub_pool_minute();

CREATE OR REPLACE FUNCTION dex_private.dehub_pool_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  metrics jsonb; observed timestamptz; sample_minute timestamptz;
  candle_sets jsonb := '{}'; candles jsonb; interval_label text; seconds integer;
  previous_price numeric; current_price numeric;
BEGIN
  IF NEW.payload IS NULL THEN RETURN NEW; END IF;
  metrics := dex_private.dehub_pool_metrics(NEW.payload->'positions');
  observed := to_timestamp((NEW.payload->>'observedAt')::numeric);
  sample_minute := date_trunc('minute', observed);
  current_price := (metrics->>'usdPrice')::numeric;
  FOR interval_label, seconds IN SELECT * FROM (VALUES ('1m',60),('5m',300),('15m',900),('30m',1800),('1h',3600)) v(label, seconds) LOOP
    WITH grouped AS (
      SELECT floor(extract(epoch FROM minute)/seconds)*seconds AS time,
        (array_agg(usd_price ORDER BY minute))[1] AS open, max(usd_price) AS high, min(usd_price) AS low,
        (array_agg(usd_price ORDER BY minute DESC))[1] AS close, max(extract(epoch FROM observed_at)) AS "observedAt"
      FROM dex_private.price_minutes
      WHERE market_scope = 'base-dhb-usdc-0-1' AND usd_price IS NOT NULL
        AND minute >= sample_minute - make_interval(secs => seconds*120) AND minute <= sample_minute
      GROUP BY 1 ORDER BY 1 DESC LIMIT 120
    ) SELECT coalesce(jsonb_agg(to_jsonb(grouped) ORDER BY time), '[]'::jsonb) INTO candles FROM grouped;
    candle_sets := candle_sets || jsonb_build_object(interval_label, candles);
  END LOOP;
  SELECT usd_price INTO previous_price FROM dex_private.price_minutes
    WHERE market_scope = 'base-dhb-usdc-0-1' AND usd_price IS NOT NULL
      AND minute <= sample_minute - interval '24 hours' ORDER BY minute DESC LIMIT 1;
  NEW.payload := NEW.payload || metrics || jsonb_build_object('candles', candle_sets,
    'change24h', CASE WHEN previous_price > 0 AND current_price IS NOT NULL
      THEN (current_price/previous_price-1)*100 ELSE NULL END);
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION dex_private.dehub_pool_snapshot() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER dehub_pool_snapshot BEFORE INSERT OR UPDATE OF payload ON dex_private.market_state
  FOR EACH ROW EXECUTE FUNCTION dex_private.dehub_pool_snapshot();

-- Older minute rows no longer retain their positions, so their aggregate
-- prices cannot be relabelled as this pool's history. Keep them intact and
-- start the scoped chart at the latest observation we can actually prove.
WITH live AS (
  SELECT payload, dex_private.dehub_pool_metrics(payload->'positions') AS metrics
  FROM dex_private.market_state WHERE id AND payload IS NOT NULL
)
UPDATE dex_private.price_minutes p SET
  price = (live.metrics->>'price')::numeric,
  usd_price = (live.metrics->>'usdPrice')::numeric,
  liquidity_usd = (live.metrics->>'liquidityUsd')::numeric,
  market_scope = live.metrics->>'marketScope'
FROM live WHERE p.observed_at = to_timestamp((live.payload->>'observedAt')::numeric);
UPDATE dex_private.market_state SET payload = payload WHERE id AND payload IS NOT NULL;
