CREATE TABLE public.trench_desks (
  wallet text NOT NULL, name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  document jsonb NOT NULL CHECK (octet_length(document::text) <= 120000),
  revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(wallet,name)
);
CREATE TABLE public.trench_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), host text NOT NULL,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
  focus jsonb NOT NULL DEFAULT '{}', expires_at timestamptz NOT NULL DEFAULT now()+interval '8 hours'
);
CREATE TABLE public.trench_members (
  room uuid REFERENCES public.trench_rooms ON DELETE CASCADE, wallet text,
  name text NOT NULL, seen_at timestamptz NOT NULL DEFAULT now(),
  pose jsonb NOT NULL DEFAULT '{}', PRIMARY KEY(room,wallet)
);
CREATE TABLE public.trench_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet text NOT NULL,
  symbol text NOT NULL CHECK(symbol ~ '^[A-Z0-9]{2,16}$'),
  direction text NOT NULL CHECK(direction IN ('above','below')),
  target numeric NOT NULL CHECK(target>0), notify boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), fired_at timestamptz, fired_price numeric
);
CREATE INDEX trench_alerts_pending ON public.trench_alerts(symbol) WHERE fired_at IS NULL;
CREATE TABLE public.trench_paper (
  wallet text NOT NULL, week date NOT NULL, name text NOT NULL,
  cash numeric NOT NULL DEFAULT 100000 CHECK(cash >= 0), holdings jsonb NOT NULL DEFAULT '{}',
  equity numeric NOT NULL DEFAULT 100000, peak numeric NOT NULL DEFAULT 100000,
  drawdown numeric NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(wallet,week)
);
CREATE TABLE public.trench_trades (
  id uuid PRIMARY KEY, wallet text NOT NULL, week date NOT NULL, symbol text NOT NULL,
  side text NOT NULL, quantity numeric NOT NULL, price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['trench_desks','trench_rooms','trench_members','trench_alerts','trench_paper','trench_trades'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END $$;

CREATE FUNCTION public.trench_save_desk(p_wallet text,p_name text,p_document jsonb,p_revision integer)
RETURNS public.trench_desks LANGUAGE plpgsql SET search_path=public AS $$
DECLARE saved public.trench_desks;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_wallet,0));
  IF p_revision=0 THEN
    IF (SELECT count(*) FROM trench_desks WHERE wallet=p_wallet)>=12 THEN RAISE EXCEPTION 'You can save up to 12 desks'; END IF;
    INSERT INTO trench_desks(wallet,name,document) VALUES(p_wallet,p_name,p_document) RETURNING * INTO saved;
  ELSE
    UPDATE trench_desks SET document=p_document,revision=revision+1,updated_at=now()
    WHERE wallet=p_wallet AND name=p_name AND revision=p_revision RETURNING * INTO saved;
    IF NOT FOUND THEN RAISE EXCEPTION 'This desk changed on another device. Reload before saving.'; END IF;
  END IF;
  RETURN saved;
END $$;

CREATE FUNCTION public.trench_trade(p_wallet text,p_id uuid,p_symbol text,p_side text,p_quantity numeric,p_price numeric)
RETURNS public.trench_paper LANGUAGE plpgsql SET search_path=public AS $$
DECLARE b public.trench_paper; w date:=date_trunc('week',now() AT TIME ZONE 'UTC')::date; owned numeric; cost numeric;
BEGIN
  SELECT * INTO b FROM trench_paper WHERE wallet=p_wallet AND week=w FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Join this week first'; END IF;
  IF EXISTS(SELECT 1 FROM trench_trades WHERE id=p_id AND wallet=p_wallet) THEN RETURN b; END IF;
  IF p_side NOT IN ('buy','sell') OR p_quantity<=0 OR p_quantity>1e15 OR p_price<=0 THEN RAISE EXCEPTION 'Invalid order'; END IF;
  owned:=coalesce((b.holdings->>p_symbol)::numeric,0); cost:=p_quantity*p_price;
  IF p_side='buy' THEN
    IF cost>b.cash THEN RAISE EXCEPTION 'Not enough practice cash'; END IF;
    b.cash:=b.cash-cost; owned:=owned+p_quantity;
  ELSE
    IF p_quantity>owned THEN RAISE EXCEPTION 'Not enough units to sell'; END IF;
    b.cash:=b.cash+cost; owned:=owned-p_quantity;
  END IF;
  INSERT INTO trench_trades(id,wallet,week,symbol,side,quantity,price) VALUES(p_id,p_wallet,w,p_symbol,p_side,p_quantity,p_price);
  UPDATE trench_paper SET cash=b.cash,holdings=jsonb_set(b.holdings,ARRAY[p_symbol],to_jsonb(owned)),updated_at=now()
    WHERE wallet=p_wallet AND week=w RETURNING * INTO b;
  RETURN b;
END $$;

CREATE FUNCTION public.trench_fire_alert(p_id uuid,p_price numeric)
RETURNS boolean LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a public.trench_alerts;
BEGIN
  UPDATE trench_alerts SET fired_at=now(),fired_price=p_price
  WHERE id=p_id AND fired_at IS NULL AND ((direction='above' AND p_price>=target) OR (direction='below' AND p_price<=target))
  RETURNING * INTO a;
  IF NOT FOUND THEN RETURN false; END IF;
  IF a.notify THEN
    INSERT INTO custom_notifications(recipient_address,actor_address,actor_username,type,content,reference_id,reference_title)
    VALUES(a.wallet,a.wallet,'Trenchstar','trench_price_alert',a.symbol||' crossed '||a.direction||' $'||a.target||'. Last price: $'||p_price,a.id::text,a.symbol);
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.trench_save_desk(text,text,jsonb,integer),public.trench_trade(text,uuid,text,text,numeric,numeric),public.trench_fire_alert(uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.trench_save_desk(text,text,jsonb,integer),public.trench_trade(text,uuid,text,text,numeric,numeric),public.trench_fire_alert(uuid,numeric) TO service_role;

-- The existing vault entry keeps the scheduler credential out of source and job text.
SELECT cron.schedule('trenchstar-market-watch','* * * * *',$job$
  SELECT net.http_post(
    url := 'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/trenchstar',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='email_queue_service_role_key' LIMIT 1)),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);
