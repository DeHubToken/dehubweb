CREATE TABLE IF NOT EXISTS dex_private.market_readers (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_read_at timestamptz
);
INSERT INTO dex_private.market_readers (id, last_read_at) VALUES (true, now()) ON CONFLICT (id) DO NOTHING;
REVOKE ALL ON dex_private.market_readers FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION dex_private.market_wanted()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $fn$
  SELECT coalesce((SELECT last_read_at > now() - interval '10 minutes' FROM dex_private.market_readers WHERE id), false)
      OR coalesce((SELECT (payload->>'observedAt')::numeric < extract(epoch FROM now()) - 270 FROM dex_private.market_state WHERE id), true)
$fn$;

CREATE OR REPLACE FUNCTION public.get_dex_market()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'pg_catalog' AS $fn$
DECLARE result jsonb; caller text;
BEGIN
  caller := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
                     current_setting('request.jwt.claim.role', true));
  IF caller IN ('anon', 'authenticated') THEN
    BEGIN
      UPDATE dex_private.market_readers SET last_read_at = now()
       WHERE id AND (last_read_at IS NULL OR last_read_at < now() - interval '30 seconds');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  SELECT payload INTO result FROM dex_private.market_state WHERE id;
  RETURN result;
END $fn$;

CREATE OR REPLACE FUNCTION dex_private.sample_market_fallback()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog' AS $fn$
DECLARE last_observed numeric;
BEGIN
  SELECT (payload->>'observedAt')::numeric INTO last_observed FROM dex_private.market_state WHERE id;
  IF last_observed IS NOT NULL AND last_observed > extract(epoch FROM now()) - 90 THEN RETURN; END IF;
  IF NOT dex_private.market_wanted() THEN RETURN; END IF;
  PERFORM dex_private.sample_market();
END $fn$;

CREATE OR REPLACE FUNCTION public.trench_market_watch()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'trench_internal'
AS $function$
DECLARE response record; prices jsonb; a record; b record;
  value numeric; high numeric; fired integer:=0; valued integer:=0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('trench_market_watch',0)) THEN
    RETURN jsonb_build_object('skipped',true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trench_alerts WHERE fired_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.trench_paper WHERE week=date_trunc('week',now() AT TIME ZONE 'UTC')::date) THEN
    DELETE FROM public.trench_rooms WHERE expires_at<now();
    RETURN jsonb_build_object('ok',true,'idle',true);
  END IF;
  PERFORM trench_internal.http_set_curlopt('CURLOPT_TIMEOUT_MS','8000');
  SELECT * INTO response FROM trench_internal.http_get('https://data-api.binance.vision/api/v3/ticker/price');
  IF response.status<>200 THEN RAISE EXCEPTION 'Market feed returned HTTP %',response.status; END IF;
  SELECT jsonb_object_agg(left(v->>'symbol',length(v->>'symbol')-4),(v->>'price')::numeric)
  INTO prices FROM jsonb_array_elements(response.content::jsonb) v
  WHERE v->>'symbol'=ANY(ARRAY['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','SUIUSDT','PEPEUSDT','WIFUSDT','BONKUSDT','TONUSDT','NEARUSDT','ARBUSDT','OPUSDT','INJUSDT','FETUSDT','SEIUSDT','JUPUSDT'])
    AND (v->>'price')::numeric>0;
  IF prices IS NULL THEN RAISE EXCEPTION 'No supported live prices returned'; END IF;
  FOR a IN SELECT id,symbol FROM public.trench_alerts WHERE fired_at IS NULL LOOP
    IF prices ? a.symbol AND public.trench_fire_alert(a.id,(prices->>a.symbol)::numeric) THEN fired:=fired+1; END IF;
  END LOOP;
  FOR b IN SELECT * FROM public.trench_paper WHERE week=date_trunc('week',now() AT TIME ZONE 'UTC')::date FOR UPDATE LOOP
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(b.holdings) s WHERE NOT prices ? s) THEN CONTINUE; END IF;
    SELECT b.cash+coalesce(sum(h.value::numeric*(prices->>h.key)::numeric),0)
    INTO value FROM jsonb_each_text(b.holdings) h;
    high:=greatest(b.peak,value);
    UPDATE public.trench_paper SET equity=value,peak=high,drawdown=greatest(b.drawdown,(high-value)/high*100)
    WHERE wallet=b.wallet AND week=b.week;
    valued:=valued+1;
  END LOOP;
  DELETE FROM public.trench_rooms WHERE expires_at<now();
  RETURN jsonb_build_object('ok',true,'fired',fired,'valued',valued);
END $function$;

SELECT cron.alter_job(196, schedule := '*/10 * * * *');
SELECT cron.alter_job(188, schedule := '*/15 * * * *');
SELECT cron.alter_job(jobid, command := regexp_replace(command, '\)\s*;\s*$', ') WHERE dex_private.market_wanted();'))
  FROM cron.job WHERE jobid = 198 AND command NOT LIKE '%market_wanted%';
SELECT cron.unschedule(5);
SELECT cron.unschedule(17);
SELECT cron.unschedule(18);
SELECT cron.schedule('cleanup-net-http-response-daily', '30 3 * * *', $c$DELETE FROM net._http_response WHERE created < now() - interval '1 day'$c$);
SELECT cron.schedule('cleanup-cron-job-run-details-daily', '45 3 * * *', $c$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '2 days'$c$);
SELECT cron.schedule('cleanup-dex-price-minutes-daily', '50 3 * * *', $c$DELETE FROM dex_private.price_minutes WHERE minute < now() - interval '8 days'$c$);

SELECT cron.schedule('migrate-ai-images-daily', '5 4 * * *', $c$
  SELECT net.http_post(
    url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/migrate-ai-images-to-storage?batch=10',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$c$);