BEGIN;
INSERT INTO public.trench_alerts(id,wallet,symbol,direction,target,notify)
VALUES('00000000-0000-4000-8000-000000009913','trenchstar-worker-regression','BTC','above',1,false);
INSERT INTO public.trench_paper(wallet,week,name,cash,holdings)
VALUES('trenchstar-worker-regression',date_trunc('week',now() AT TIME ZONE 'UTC')::date,'Regression',0,'{"BTC":1}');
DO $$
DECLARE r jsonb;
BEGIN
  r:=public.trench_market_watch();
  IF r->>'ok'<>'true' THEN RAISE EXCEPTION 'Worker did not complete'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.trench_alerts WHERE id='00000000-0000-4000-8000-000000009913' AND fired_at IS NOT NULL AND fired_price>1) THEN
    RAISE EXCEPTION 'Live price did not trigger alert';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.trench_paper WHERE wallet='trenchstar-worker-regression' AND equity>0 AND equity=(SELECT fired_price FROM public.trench_alerts WHERE id='00000000-0000-4000-8000-000000009913')) THEN
    RAISE EXCEPTION 'Portfolio did not use live price';
  END IF;
  IF has_function_privilege('anon','public.trench_market_watch()','EXECUTE') OR has_schema_privilege('anon','trench_internal','USAGE') THEN
    RAISE EXCEPTION 'Anonymous client can access worker';
  END IF;
END $$;
ROLLBACK;
SELECT 'Live alert, portfolio valuation and access checks passed; fixtures rolled back' AS result;
