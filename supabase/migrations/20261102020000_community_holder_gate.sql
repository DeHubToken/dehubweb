-- =============================================================================
-- Holder groups: a community can require members to hold a token.
-- =============================================================================
-- The owner picks a chain, a token contract and a minimum amount. Joining (and
-- sending in chat) then needs a holding the database verified itself.
--
-- No secret and no edge function is involved: the database asks a public
-- JSON-RPC node for balanceOf(wallet) through pg_net, reads the reply out of
-- net._http_response and records the result. A client can start a check and
-- read its outcome, but can never write a balance.
--
-- Flow:  community_holder_check_start(id)  -> fires the eth_call
--        community_holder_check_result(id) -> 'pending' until the reply lands,
--                                             then {balance, eligible}
-- =============================================================================

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS holder_gate_chain_id INTEGER,
  ADD COLUMN IF NOT EXISTS holder_gate_token    TEXT,
  ADD COLUMN IF NOT EXISTS holder_gate_min      NUMERIC,
  ADD COLUMN IF NOT EXISTS holder_gate_symbol   TEXT,
  ADD COLUMN IF NOT EXISTS holder_gate_decimals INTEGER NOT NULL DEFAULT 18;

ALTER TABLE public.communities DROP CONSTRAINT IF EXISTS communities_holder_gate_check;
ALTER TABLE public.communities ADD CONSTRAINT communities_holder_gate_check CHECK (
  holder_gate_token IS NULL OR (
    holder_gate_token ~ '^0x[0-9a-f]{40}$'
    AND holder_gate_chain_id IN (1, 56, 8453)
    AND holder_gate_min IS NOT NULL AND holder_gate_min >= 0
    AND holder_gate_decimals BETWEEN 0 AND 36
  )
);

-- Verified holdings. On-chain balances are public, so anyone may read them;
-- only the SECURITY DEFINER functions below write.
CREATE TABLE IF NOT EXISTS public.community_holders (
  community_id   UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  balance        NUMERIC NOT NULL DEFAULT 0,
  checked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, wallet_address)
);
CREATE INDEX IF NOT EXISTS community_holders_rank_idx
  ON public.community_holders (community_id, balance DESC);

ALTER TABLE public.community_holders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Holdings are public" ON public.community_holders;
CREATE POLICY "Holdings are public" ON public.community_holders FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.community_holders FROM anon, authenticated;
GRANT SELECT ON public.community_holders TO anon, authenticated;

-- Outstanding RPC requests, private to the database.
CREATE TABLE IF NOT EXISTS public.community_holder_requests (
  id             BIGSERIAL PRIMARY KEY,
  community_id   UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  net_request_id BIGINT NOT NULL,
  chain_id       INTEGER NOT NULL,
  token          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_holder_requests_lookup_idx
  ON public.community_holder_requests (community_id, wallet_address, created_at DESC);
ALTER TABLE public.community_holder_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_holder_requests FROM anon, authenticated;

-- ─── helpers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.holder_gate_rpc_url(_chain_id INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _chain_id
    WHEN 56   THEN 'https://bsc-dataseed.bnbchain.org'
    WHEN 8453 THEN 'https://mainnet.base.org'
    WHEN 1    THEN 'https://ethereum-rpc.publicnode.com'
  END;
$$;

-- 256-bit hex (with or without 0x) to NUMERIC, exactly.
CREATE OR REPLACE FUNCTION public.holder_gate_hex_to_numeric(_hex TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  h   TEXT := lower(regexp_replace(coalesce(_hex, ''), '^0x', ''));
  acc NUMERIC := 0;
  i   INTEGER;
BEGIN
  IF h = '' THEN RETURN 0; END IF;
  IF h !~ '^[0-9a-f]+$' THEN RETURN NULL; END IF;
  FOR i IN 1..length(h) LOOP
    acc := acc * 16 + position(substr(h, i, 1) IN '0123456789abcdef') - 1;
  END LOOP;
  RETURN acc;
END;
$$;

CREATE OR REPLACE FUNCTION public.community_holder_ok(_community_id UUID, _wallet TEXT, _max_age INTERVAL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.communities c
      JOIN public.community_holders h
        ON h.community_id = c.id AND h.wallet_address = lower(coalesce(_wallet, ''))
     WHERE c.id = _community_id
       AND h.balance >= coalesce(c.holder_gate_min, 0)
       AND (_max_age IS NULL OR h.checked_at > now() - _max_age)
  );
$$;

-- ─── owner sets / clears the gate ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_set_holder_gate(
  _community_id UUID,
  _chain_id     INTEGER,
  _token        TEXT,
  _min          NUMERIC,
  _symbol       TEXT,
  _decimals     INTEGER
)
RETURNS public.communities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller TEXT := nullif(public.get_signed_request_wallet_address(), '');
  row    public.communities;
BEGIN
  IF caller IS NULL OR public.community_role_of(_community_id, caller) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;

  IF _token IS NULL OR btrim(_token) = '' THEN
    UPDATE public.communities
       SET holder_gate_chain_id = NULL, holder_gate_token = NULL, holder_gate_min = NULL,
           holder_gate_symbol = NULL, holder_gate_decimals = 18
     WHERE id = _community_id
     RETURNING * INTO row;
  ELSE
    UPDATE public.communities
       SET holder_gate_chain_id = _chain_id,
           holder_gate_token    = lower(btrim(_token)),
           holder_gate_min      = _min,
           holder_gate_symbol   = left(nullif(btrim(coalesce(_symbol, '')), ''), 16),
           holder_gate_decimals = coalesce(_decimals, 18)
     WHERE id = _community_id
     RETURNING * INTO row;
    -- Holdings read for a different token mean nothing now.
    DELETE FROM public.community_holders WHERE community_id = _community_id;
  END IF;

  RETURN row;
END;
$$;

-- ─── checks ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_holder_check_start(_community_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  caller TEXT := nullif(public.get_signed_request_wallet_address(), '');
  c      public.communities;
  req_id BIGINT;
  recent INTEGER;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'sign_in_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.communities WHERE id = _community_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'community_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF c.holder_gate_token IS NULL THEN
    RETURN jsonb_build_object('status', 'open');
  END IF;

  SELECT count(*) INTO recent
    FROM public.community_holder_requests
   WHERE wallet_address = caller AND created_at > now() - interval '1 minute';
  IF recent >= 6 THEN
    RAISE EXCEPTION 'holder_check_rate_limited' USING ERRCODE = '53400';
  END IF;

  SELECT net.http_post(
    url     := public.holder_gate_rpc_url(c.holder_gate_chain_id),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := jsonb_build_object(
      'jsonrpc', '2.0', 'id', 1, 'method', 'eth_call',
      'params', jsonb_build_array(
        jsonb_build_object(
          'to', c.holder_gate_token,
          'data', '0x70a08231' || lpad(substr(caller, 3), 64, '0')
        ),
        'latest'
      )
    ),
    timeout_milliseconds := 8000
  ) INTO req_id;

  INSERT INTO public.community_holder_requests (community_id, wallet_address, net_request_id, chain_id, token)
  VALUES (_community_id, caller, req_id, c.holder_gate_chain_id, c.holder_gate_token);

  DELETE FROM public.community_holder_requests WHERE created_at < now() - interval '1 day';

  RETURN jsonb_build_object('status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.community_holder_check_result(_community_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  caller  TEXT := nullif(public.get_signed_request_wallet_address(), '');
  c       public.communities;
  r       public.community_holder_requests;
  resp    RECORD;
  raw     NUMERIC;
  amount  NUMERIC;
  body    JSONB;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'sign_in_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.communities WHERE id = _community_id;
  IF NOT FOUND OR c.holder_gate_token IS NULL THEN
    RETURN jsonb_build_object('status', 'open');
  END IF;

  SELECT * INTO r
    FROM public.community_holder_requests
   WHERE community_id = _community_id AND wallet_address = caller
     AND token = c.holder_gate_token AND chain_id = c.holder_gate_chain_id
   ORDER BY id DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  SELECT status_code, content, error_msg INTO resp
    FROM net._http_response WHERE id = r.net_request_id;
  IF NOT FOUND THEN
    IF r.created_at < now() - interval '20 seconds' THEN
      RETURN jsonb_build_object('status', 'failed');
    END IF;
    RETURN jsonb_build_object('status', 'pending');
  END IF;

  IF resp.status_code IS DISTINCT FROM 200 OR resp.content IS NULL THEN
    RETURN jsonb_build_object('status', 'failed');
  END IF;
  BEGIN
    body := resp.content::jsonb;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('status', 'failed');
  END;
  IF body ? 'error' OR NOT (body ? 'result') THEN
    RETURN jsonb_build_object('status', 'failed');
  END IF;

  raw := public.holder_gate_hex_to_numeric(body->>'result');
  IF raw IS NULL THEN
    RETURN jsonb_build_object('status', 'failed');
  END IF;
  amount := raw / power(10::numeric, c.holder_gate_decimals);

  INSERT INTO public.community_holders (community_id, wallet_address, balance, checked_at)
  VALUES (_community_id, caller, amount, now())
  ON CONFLICT (community_id, wallet_address)
  DO UPDATE SET balance = EXCLUDED.balance, checked_at = EXCLUDED.checked_at;

  RETURN jsonb_build_object(
    'status', 'done',
    'balance', amount,
    'min', c.holder_gate_min,
    'symbol', c.holder_gate_symbol,
    'eligible', amount >= coalesce(c.holder_gate_min, 0)
  );
END;
$$;

-- ─── enforcement ───────────────────────────────────────────────────────────

-- Joining as a member needs a passing check from the last hour, whichever
-- path inserts the row (button, invite link). Owners and admins are exempt.
CREATE OR REPLACE FUNCTION public.community_holder_join_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate TEXT;
BEGIN
  IF NEW.role IS DISTINCT FROM 'member' THEN
    RETURN NEW;
  END IF;
  SELECT holder_gate_token INTO gate FROM public.communities WHERE id = NEW.community_id;
  IF gate IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT public.community_holder_ok(NEW.community_id, NEW.wallet_address, interval '1 hour') THEN
    RAISE EXCEPTION 'holder_gate_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Named to sort last: BEFORE triggers fire alphabetically, and this one must
-- see the role community_members_guard settled, not the one a client sent.
DROP TRIGGER IF EXISTS zz_community_holder_join_guard ON public.community_members;
CREATE TRIGGER zz_community_holder_join_guard
  BEFORE INSERT ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.community_holder_join_guard();

-- Sending needs the latest check to pass. Owners and admins always may.
CREATE OR REPLACE FUNCTION public.community_holder_chat_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate TEXT;
  role TEXT;
BEGIN
  SELECT holder_gate_token INTO gate FROM public.communities WHERE id = NEW.community_id;
  IF gate IS NULL THEN
    RETURN NEW;
  END IF;
  role := public.community_role_of(NEW.community_id, NEW.wallet_address);
  IF role IN ('owner', 'admin') THEN
    RETURN NEW;
  END IF;
  IF NOT public.community_holder_ok(NEW.community_id, NEW.wallet_address, NULL) THEN
    RAISE EXCEPTION 'holder_gate_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_community_holder_chat_guard ON public.community_chat_messages;
CREATE TRIGGER zz_community_holder_chat_guard
  BEFORE INSERT ON public.community_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.community_holder_chat_guard();

-- ─── grants ────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.community_set_holder_gate(UUID, INTEGER, TEXT, NUMERIC, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_holder_check_start(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_holder_check_result(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_holder_ok(UUID, TEXT, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_set_holder_gate(UUID, INTEGER, TEXT, NUMERIC, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_holder_check_start(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_holder_check_result(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_holder_ok(UUID, TEXT, INTERVAL) TO anon, authenticated;
