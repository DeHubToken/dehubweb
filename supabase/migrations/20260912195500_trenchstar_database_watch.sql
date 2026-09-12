-- Run the scheduled work directly; no edge deployment or bearer token is needed.
CREATE SCHEMA IF NOT EXISTS trench_internal;
REVOKE ALL ON SCHEMA trench_internal FROM PUBLIC,anon,authenticated;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA trench_internal;

CREATE OR REPLACE FUNCTION public.trench_market_watch()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,trench_internal
AS $$
DECLARE response record; prices jsonb; a record; b record;
  value numeric; high numeric; fired integer:=0; valued integer:=0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('trench_market_watch',0)) THEN
    RETURN jsonb_build_object('skipped',true);
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
END $$;
REVOKE ALL ON FUNCTION public.trench_market_watch() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trench_market_watch() TO service_role;
SELECT cron.schedule('trenchstar-market-watch','* * * * *','SELECT public.trench_market_watch();');
