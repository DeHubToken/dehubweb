BEGIN;
DO $$
DECLARE w text:='0x000000000000000000000000000000000000009912';
  wk date:=date_trunc('week',now() AT TIME ZONE 'UTC')::date;
  order_id uuid:=gen_random_uuid(); saved public.trench_desks; b public.trench_paper; a uuid;
BEGIN
  saved:=public.trench_save_desk(w,'Regression','{"scene":"harbour"}',0);
  IF saved.revision<>1 THEN RAISE EXCEPTION 'Initial desk revision'; END IF;
  saved:=public.trench_save_desk(w,'Regression','{"scene":"lair"}',1);
  IF saved.revision<>2 THEN RAISE EXCEPTION 'Desk update revision'; END IF;
  BEGIN
    PERFORM public.trench_save_desk(w,'Regression','{}',1);
    RAISE EXCEPTION 'Stale overwrite accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Stale overwrite accepted' THEN RAISE; END IF;
  END;
  INSERT INTO public.trench_paper(wallet,week,name) VALUES(w,wk,'Regression');
  b:=public.trench_trade(w,order_id,'BTC','buy',2,100);
  IF b.cash<>99800 OR (b.holdings->>'BTC')::numeric<>2 THEN RAISE EXCEPTION 'Incorrect fill'; END IF;
  b:=public.trench_trade(w,order_id,'BTC','buy',2,120);
  IF b.cash<>99800 THEN RAISE EXCEPTION 'Retry double filled'; END IF;
  BEGIN
    PERFORM public.trench_trade(w,gen_random_uuid(),'BTC','sell',3,100);
    RAISE EXCEPTION 'Oversell accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Oversell accepted' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.trench_trade(w,gen_random_uuid(),'BTC','buy',2000,100);
    RAISE EXCEPTION 'Overdraft accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='Overdraft accepted' THEN RAISE; END IF; END;
  INSERT INTO public.trench_alerts(wallet,symbol,direction,target) VALUES(w,'BTC','above',100) RETURNING id INTO a;
  IF public.trench_fire_alert(a,99) THEN RAISE EXCEPTION 'Alert fired below target'; END IF;
  IF NOT public.trench_fire_alert(a,100) THEN RAISE EXCEPTION 'Alert failed at target'; END IF;
  IF public.trench_fire_alert(a,101) THEN RAISE EXCEPTION 'Alert fired twice'; END IF;
  IF has_table_privilege('anon','public.trench_desks','select') OR has_function_privilege('anon','public.trench_trade(text,uuid,text,text,numeric,numeric)','execute') THEN RAISE EXCEPTION 'Anonymous private access'; END IF;
END $$;
ROLLBACK;
