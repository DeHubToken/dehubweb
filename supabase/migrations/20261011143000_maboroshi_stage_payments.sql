-- Maboroshi draws from the same verified transfer receipts as Creator jobs.
CREATE TABLE IF NOT EXISTS public.maboroshi_stage_payments (
  key text PRIMARY KEY CHECK (key ~ '^maboroshi:[a-f0-9]{32}:(prepare|draft|hd)$'),
  wallet_address text NOT NULL,
  tx_hash text NOT NULL,
  price_dhb numeric NOT NULL CHECK (price_dhb > 0 AND price_dhb <= 100000),
  status text NOT NULL DEFAULT 'charged' CHECK (status IN ('charged', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.maboroshi_stage_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.maboroshi_stage_payments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.maboroshi_stage_payments TO service_role;

CREATE OR REPLACE FUNCTION public.maboroshi_payment_spend(p_key text, p_wallet text, p_tx_hash text, p_dhb numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing public.maboroshi_stage_payments;
BEGIN
  IF p_key IS NULL OR p_key !~ '^maboroshi:[a-f0-9]{32}:(prepare|draft|hd)$'
    OR p_wallet IS NULL OR lower(p_wallet) !~ '^0x[a-f0-9]{40}$'
    OR p_tx_hash IS NULL OR lower(p_tx_hash) !~ '^0x[a-f0-9]{64}$'
    OR p_dhb IS NULL OR p_dhb <= 0 OR p_dhb > 100000 THEN
    RAISE EXCEPTION 'INVALID_PAYMENT';
  END IF;
  -- Serialize a stage even before its first receipt exists.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_key, 0));
  SELECT * INTO existing FROM maboroshi_stage_payments WHERE key = p_key;
  IF FOUND THEN
    IF existing.wallet_address <> lower(p_wallet) OR existing.tx_hash <> lower(p_tx_hash) OR existing.price_dhb <> p_dhb THEN
      RAISE EXCEPTION 'PAYMENT_BINDING_MISMATCH';
    END IF;
    IF existing.status <> 'charged' THEN RAISE EXCEPTION 'PAYMENT_REVERSED'; END IF;
    RETURN;
  END IF;
  PERFORM ai_payment_spend(p_tx_hash, p_wallet, p_dhb);
  INSERT INTO maboroshi_stage_payments(key, wallet_address, tx_hash, price_dhb)
  VALUES(p_key, lower(p_wallet), lower(p_tx_hash), p_dhb);
END; $$;

CREATE OR REPLACE FUNCTION public.maboroshi_payment_refund(p_key text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE payment public.maboroshi_stage_payments;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_key, 0));
  SELECT * INTO payment FROM maboroshi_stage_payments WHERE key = p_key FOR UPDATE;
  IF NOT FOUND OR payment.status = 'refunded' THEN RETURN true; END IF;
  PERFORM ai_payment_release(payment.tx_hash, payment.wallet_address, payment.price_dhb, p_key);
  UPDATE maboroshi_stage_payments SET status = 'refunded', updated_at = now() WHERE key = p_key;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.maboroshi_payment_spend(text,text,text,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.maboroshi_payment_refund(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maboroshi_payment_spend(text,text,text,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.maboroshi_payment_refund(text) TO service_role;
