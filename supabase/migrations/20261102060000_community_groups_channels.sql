-- =============================================================================
-- Groups and channels, started from the + button in Messages.
-- =============================================================================
-- Both are communities underneath, so they keep everything communities already
-- have (invites, roles, pins, polls, private join requests, holder gates).
--
--   kind = 'group'    everyone in it chats
--   kind = 'channel'  only the owner and admins post; members read
--
-- A channel (or group) can charge a one-off entry price in DeHub tokens, paid
-- straight to the owner's wallet. The database checks the payment itself: it
-- reads the transaction receipt from the chain through pg_net and looks for a
-- DHB Transfer to the owner of at least the price. One transaction buys one
-- entry. No secret and no edge function is involved.
-- =============================================================================

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS kind        TEXT NOT NULL DEFAULT 'community',
  ADD COLUMN IF NOT EXISTS entry_price NUMERIC;

ALTER TABLE public.communities DROP CONSTRAINT IF EXISTS communities_kind_check;
ALTER TABLE public.communities ADD CONSTRAINT communities_kind_check
  CHECK (kind IN ('community', 'group', 'channel'));
ALTER TABLE public.communities DROP CONSTRAINT IF EXISTS communities_entry_price_check;
ALTER TABLE public.communities ADD CONSTRAINT communities_entry_price_check
  CHECK (entry_price IS NULL OR (entry_price >= 0 AND entry_price <= 1000000000));

CREATE INDEX IF NOT EXISTS communities_kind_idx ON public.communities (kind) WHERE kind <> 'community';

-- Paid entries. Readable by the payer and the owner only; written only here.
CREATE TABLE IF NOT EXISTS public.community_entry_payments (
  id             BIGSERIAL PRIMARY KEY,
  community_id   UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  chain_id       INTEGER NOT NULL,
  tx_hash        TEXT NOT NULL,
  net_request_id BIGINT,
  amount         NUMERIC,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One transaction can only ever buy one entry.
CREATE UNIQUE INDEX IF NOT EXISTS community_entry_payments_tx_paid_idx
  ON public.community_entry_payments (lower(tx_hash)) WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS community_entry_payments_lookup_idx
  ON public.community_entry_payments (community_id, wallet_address, id DESC);
ALTER TABLE public.community_entry_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_entry_payments FROM anon, authenticated;

-- ─── helpers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_entry_token(_chain_id INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _chain_id
    WHEN 56   THEN '0x680d3113caf77b61b510f332d5ef4cf5b41a761d'
    WHEN 8453 THEN '0xd20ab1015f6a2de4a6fddebab270113f689c2f7c'
  END;
$$;

CREATE OR REPLACE FUNCTION public.community_entry_paid(_community_id UUID, _wallet TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_entry_payments
     WHERE community_id = _community_id
       AND wallet_address = lower(coalesce(_wallet, ''))
       AND status = 'paid'
  );
$$;

-- ─── paying ────────────────────────────────────────────────────────────────

-- Hand the database the hash of a DHB transfer to the owner. It asks the chain
-- for the receipt; community_entry_check reads the answer.
CREATE OR REPLACE FUNCTION public.community_entry_submit(_community_id UUID, _chain_id INTEGER, _tx_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  caller TEXT := nullif(public.get_signed_request_wallet_address(), '');
  c      public.communities;
  h      TEXT := lower(btrim(coalesce(_tx_hash, '')));
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
  IF coalesce(c.entry_price, 0) <= 0 THEN
    RETURN jsonb_build_object('status', 'free');
  END IF;
  IF public.community_entry_paid(_community_id, caller) THEN
    RETURN jsonb_build_object('status', 'paid');
  END IF;
  IF public.community_entry_token(_chain_id) IS NULL THEN
    RAISE EXCEPTION 'unsupported_chain' USING ERRCODE = '22023';
  END IF;
  IF h !~ '^0x[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'bad_tx_hash' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.community_entry_payments WHERE lower(tx_hash) = h AND status = 'paid') THEN
    RAISE EXCEPTION 'tx_already_used' USING ERRCODE = '23505';
  END IF;

  SELECT count(*) INTO recent
    FROM public.community_entry_payments
   WHERE wallet_address = caller AND created_at > now() - interval '1 minute';
  IF recent >= 10 THEN
    RAISE EXCEPTION 'entry_check_rate_limited' USING ERRCODE = '53400';
  END IF;

  SELECT net.http_post(
    url     := public.holder_gate_rpc_url(_chain_id),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := jsonb_build_object(
      'jsonrpc', '2.0', 'id', 1, 'method', 'eth_getTransactionReceipt',
      'params', jsonb_build_array(h)
    ),
    timeout_milliseconds := 8000
  ) INTO req_id;

  INSERT INTO public.community_entry_payments (community_id, wallet_address, chain_id, tx_hash, net_request_id)
  VALUES (_community_id, caller, _chain_id, h, req_id);

  RETURN jsonb_build_object('status', 'pending');
END;
$$;

-- 'pending' while the receipt is on its way (or the tx is not mined yet),
-- 'paid' once a big enough DHB Transfer to the owner is in it, else 'failed'.
CREATE OR REPLACE FUNCTION public.community_entry_check(_community_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  caller  TEXT := nullif(public.get_signed_request_wallet_address(), '');
  c       public.communities;
  p       public.community_entry_payments;
  resp    RECORD;
  body    JSONB;
  owner_topic TEXT;
  token   TEXT;
  paid    NUMERIC := 0;
  lg      JSONB;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'sign_in_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.communities WHERE id = _community_id;
  IF NOT FOUND OR coalesce(c.entry_price, 0) <= 0 THEN
    RETURN jsonb_build_object('status', 'free');
  END IF;
  IF public.community_entry_paid(_community_id, caller) THEN
    RETURN jsonb_build_object('status', 'paid');
  END IF;

  SELECT * INTO p FROM public.community_entry_payments
   WHERE community_id = _community_id AND wallet_address = caller
   ORDER BY id DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  IF p.status = 'failed' THEN
    RETURN jsonb_build_object('status', 'failed');
  END IF;

  SELECT status_code, content INTO resp FROM net._http_response WHERE id = p.net_request_id;
  IF NOT FOUND THEN
    IF p.created_at < now() - interval '30 seconds' THEN
      UPDATE public.community_entry_payments SET status = 'failed' WHERE id = p.id;
      RETURN jsonb_build_object('status', 'failed');
    END IF;
    RETURN jsonb_build_object('status', 'pending');
  END IF;

  BEGIN
    body := resp.content::jsonb;
  EXCEPTION WHEN others THEN
    body := NULL;
  END;
  IF resp.status_code IS DISTINCT FROM 200 OR body IS NULL OR body ? 'error' THEN
    UPDATE public.community_entry_payments SET status = 'failed' WHERE id = p.id;
    RETURN jsonb_build_object('status', 'failed');
  END IF;

  -- Not mined yet: the node answers null. Ask again.
  IF body->'result' IS NULL OR jsonb_typeof(body->'result') = 'null' THEN
    IF p.created_at < now() - interval '3 minutes' THEN
      UPDATE public.community_entry_payments SET status = 'failed' WHERE id = p.id;
      RETURN jsonb_build_object('status', 'failed');
    END IF;
    UPDATE public.community_entry_payments
       SET net_request_id = net.http_post(
             url     := public.holder_gate_rpc_url(p.chain_id),
             headers := '{"Content-Type":"application/json"}'::jsonb,
             body    := jsonb_build_object('jsonrpc', '2.0', 'id', 1, 'method', 'eth_getTransactionReceipt',
                                           'params', jsonb_build_array(p.tx_hash)),
             timeout_milliseconds := 8000)
     WHERE id = p.id;
    RETURN jsonb_build_object('status', 'pending');
  END IF;

  IF body->'result'->>'status' IS DISTINCT FROM '0x1' THEN
    UPDATE public.community_entry_payments SET status = 'failed' WHERE id = p.id;
    RETURN jsonb_build_object('status', 'failed');
  END IF;

  token := public.community_entry_token(p.chain_id);
  owner_topic := '0x' || lpad(substr(lower(c.creator_wallet_address), 3), 64, '0');
  FOR lg IN SELECT * FROM jsonb_array_elements(coalesce(body->'result'->'logs', '[]'::jsonb)) LOOP
    IF lower(lg->>'address') = token
       AND lower(lg->'topics'->>0) = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
       AND lower(lg->'topics'->>2) = owner_topic THEN
      paid := paid + coalesce(public.holder_gate_hex_to_numeric(lg->>'data'), 0) / power(10::numeric, 18);
    END IF;
  END LOOP;

  IF paid + 0.000001 < c.entry_price THEN
    UPDATE public.community_entry_payments SET status = 'failed', amount = paid WHERE id = p.id;
    RETURN jsonb_build_object('status', 'failed', 'amount', paid);
  END IF;

  BEGIN
    UPDATE public.community_entry_payments SET status = 'paid', amount = paid WHERE id = p.id;
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.community_entry_payments SET status = 'failed', amount = paid WHERE id = p.id;
    RETURN jsonb_build_object('status', 'failed', 'reason', 'tx_already_used');
  END;
  RETURN jsonb_build_object('status', 'paid', 'amount', paid);
END;
$$;

-- ─── enforcement ───────────────────────────────────────────────────────────

-- A paid community needs a confirmed payment before a member row goes in.
CREATE OR REPLACE FUNCTION public.community_entry_join_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  price NUMERIC;
BEGIN
  IF NEW.role IS DISTINCT FROM 'member' THEN
    RETURN NEW;
  END IF;
  SELECT entry_price INTO price FROM public.communities WHERE id = NEW.community_id;
  IF coalesce(price, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  IF NOT public.community_entry_paid(NEW.community_id, NEW.wallet_address) THEN
    RAISE EXCEPTION 'entry_payment_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_community_entry_join_guard ON public.community_members;
CREATE TRIGGER zz_community_entry_join_guard
  BEFORE INSERT ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.community_entry_join_guard();

-- In a channel only the owner and admins post.
CREATE OR REPLACE FUNCTION public.community_channel_post_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k TEXT;
BEGIN
  SELECT kind INTO k FROM public.communities WHERE id = NEW.community_id;
  IF k IS DISTINCT FROM 'channel' THEN
    RETURN NEW;
  END IF;
  IF coalesce(public.community_role_of(NEW.community_id, NEW.wallet_address), '') NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'channel_admins_only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_community_channel_post_guard ON public.community_chat_messages;
CREATE TRIGGER zz_community_channel_post_guard
  BEFORE INSERT ON public.community_chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.community_channel_post_guard();

-- ─── grants ────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.community_entry_submit(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_entry_check(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.community_entry_paid(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_entry_submit(UUID, INTEGER, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_entry_check(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_entry_paid(UUID, TEXT) TO anon, authenticated;
