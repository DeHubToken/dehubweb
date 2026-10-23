-- Comment eligibility is checked against Stream, including direct REST writes.
CREATE OR REPLACE FUNCTION public.governance_has_comment_badge(wallet text, token text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  response record;
  account jsonb;
  amount numeric;
  price numeric;
  scale numeric := 1;
  raw_scale numeric;
  minimum numeric;
  lock_requirement numeric;
BEGIN
  IF wallet IS NULL OR wallet !~* '^0x[0-9a-f]{40}$' THEN RETURN false; END IF;
  PERFORM set_config('http.curlopt_timeout_msec', '5000', true);
  PERFORM set_config('http.curlopt_connecttimeout_msec', '2000', true);
  SELECT * INTO response FROM trench_internal.http(ROW(
    'GET', 'https://api.dehub.io/api/account_info/' || lower(wallet),
    CASE WHEN token IS NOT NULL THEN
      ARRAY[trench_internal.http_header('Authorization', ('Bearer ' || token)::varchar)]
    ELSE ARRAY[]::trench_internal.http_header[] END,
    NULL, NULL
  )::trench_internal.http_request);
  IF response.status <> 200 THEN
    RAISE EXCEPTION 'Badge allowance is temporarily unavailable.';
  END IF;
  account := response.content::jsonb -> 'result';
  IF account IS NULL OR account = 'null'::jsonb THEN RETURN false; END IF;
  IF coalesce((account ->> 'isBanned')::boolean, false) THEN RETURN false; END IF;
  IF lower(trim(replace(coalesce(account ->> 'username', ''), '@', ''))) = ANY (
    ARRAY['maldoteth','mal','aaron','ma255','dehubprime','algiers',
          'angelbeattales','infinitebaffle','angieluthien','beinsports']
  ) THEN RETURN true; END IF;
  amount := coalesce((account ->> 'badgeBalance')::numeric, 0);
  -- Match the governance badge ladder's price scaling and conservative fallback.
  BEGIN
    SELECT * INTO response FROM trench_internal.http_get(
      'https://aigxuutjaqsywioxjefr.supabase.co/functions/v1/get-dhb-price'::varchar
    );
    IF response.status = 200 THEN
      price := (response.content::jsonb #>> '{prices,DHB}')::numeric;
      IF price > 0 THEN
        raw_scale := 0.001 / price;
        scale := greatest(0.001, least(1,
          round(raw_scale, 1 - floor(log(raw_scale))::integer)));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN scale := 1;
  END;
  minimum := greatest(1, round(10000 * scale,
    2 - floor(log(10000 * scale))::integer));
  IF amount >= minimum THEN RETURN true; END IF;
  IF account #>> '{badgeLock,tier}' = ANY (ARRAY[
    'Crab','Ghost Lobster','Piranha','Giant Tortoise','King Cobra','Octopus',
    'Crocodile','Dolphin','Tiger Shark','Great White Shark','Killer Whale',
    'Blue Whale','Megalodon','Lobster','Crocodite','Meglodon','Tortoise','Cobra'
  ]) THEN
    lock_requirement := (account #>> '{badgeLock,requirement}')::numeric;
    RETURN coalesce(lock_requirement > 0 AND amount >= lock_requirement, false);
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.governance_has_comment_badge(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_governance_comment_badge()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  token text;
  response record;
  verified_wallet text;
BEGIN
  token := headers ->> 'x-dehub-token';
  IF token IS NULL OR token = '' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  PERFORM set_config('http.curlopt_timeout_msec', '5000', true);
  PERFORM set_config('http.curlopt_connecttimeout_msec', '2000', true);
  SELECT * INTO response FROM trench_internal.http(ROW(
    'GET', 'https://api.dehub.io/api/auth/verify',
    ARRAY[trench_internal.http_header('Authorization', ('Bearer ' || token)::varchar)],
    NULL, NULL
  )::trench_internal.http_request);
  IF response.status <> 200 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
  END IF;
  verified_wallet := lower(response.content::jsonb ->> 'address');
  IF verified_wallet IS NULL OR verified_wallet <> lower(NEW.wallet_address) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Token does not belong to the supplied wallet';
  END IF;
  IF TG_OP = 'UPDATE' AND lower(OLD.wallet_address) <> verified_wallet THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Cannot change the comment author';
  END IF;
  IF NOT public.governance_has_comment_badge(verified_wallet, token) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Badge holders only';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_governance_comment_badge() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS governance_comment_badge_guard ON public.governance_comments;
CREATE TRIGGER governance_comment_badge_guard
BEFORE INSERT OR UPDATE ON public.governance_comments
FOR EACH ROW EXECUTE FUNCTION public.enforce_governance_comment_badge();
