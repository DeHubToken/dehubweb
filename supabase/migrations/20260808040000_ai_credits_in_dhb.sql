-- ============================================================================
-- AI credits, denominated in DHB
-- ============================================================================
-- Before this, "credits" meant four unrelated things and three of them were
-- not real:
--
--   * The pricing page sold "3,500 credits/mo" against a Stripe subscription
--     that granted nothing. premium_subscriptions is only ever read by
--     ads-serve, to suppress ads. No balance existed to grant to.
--   * Voice credits lived in localStorage, so they were forgeable in devtools
--     and vanished on a cache clear.
--   * Image/video/3D generation had no balance at all. The paywall modal sent
--     DHB to the treasury client-side and then called the generate function,
--     which never checked that any payment had happened.
--
-- Only the ads ledger (ad_accounts / ad_payments) was built properly, so this
-- follows it: an append-only ledger, an on-chain verified top-up, and a
-- balance that only moves through SECURITY DEFINER functions.
--
-- The unit is DHB rather than USD. With the gateway peg at $0.001 the two are
-- interchangeable at 1,000 DHB = $1, but storing DHB means the number a user
-- sees is the token they actually hold, and it does not silently re-value if
-- the peg ever moves.

-- ============================================================================
-- 1. Balances
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_credits (
  wallet_address text PRIMARY KEY,
  balance_dhb numeric NOT NULL DEFAULT 0 CHECK (balance_dhb >= 0),
  lifetime_granted_dhb numeric NOT NULL DEFAULT 0,
  lifetime_spent_dhb numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_credits IS
  'AI generation balance per wallet, denominated in DHB. Only ai_credit_grant / ai_credit_spend / ai_credit_refund may move balance_dhb.';

-- ============================================================================
-- 2. Ledger
-- ============================================================================
-- Append-only. Every balance movement writes exactly one row, so a balance can
-- always be reconstructed and a disputed charge can be traced to its job.

CREATE TABLE IF NOT EXISTS public.ai_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  delta_dhb numeric NOT NULL,
  -- 'topup' | 'plan_grant' | 'free_grant' | 'spend' | 'refund'
  reason text NOT NULL,
  -- Whatever makes the credit unique upstream: a tx hash for a top-up, a
  -- Stripe invoice id for a plan grant, a job id for a spend or refund.
  ref text,
  model_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_ledger_wallet
  ON public.ai_credit_ledger (wallet_address, created_at DESC);

-- One credit per external reference. This is the whole idempotency story:
-- a replayed tx hash, a re-delivered Stripe webhook and a double refund all
-- collide here rather than each needing their own guard. Debits are excluded
-- because every generation is a distinct job.
CREATE UNIQUE INDEX IF NOT EXISTS ai_credit_ledger_credit_ref_key
  ON public.ai_credit_ledger (reason, ref)
  WHERE ref IS NOT NULL AND delta_dhb > 0;

-- ============================================================================
-- 3. Movements
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ai_credit_grant(
  p_wallet text,
  p_dhb numeric,
  p_reason text,
  p_ref text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance numeric;
BEGIN
  IF p_dhb IS NULL OR p_dhb <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;
  IF p_reason NOT IN ('topup', 'plan_grant', 'free_grant', 'refund') THEN
    RAISE EXCEPTION 'INVALID_REASON';
  END IF;

  -- Claim the reference first, so a replay fails before any balance moves.
  INSERT INTO ai_credit_ledger (wallet_address, delta_dhb, reason, ref, metadata)
  VALUES (lower(p_wallet), p_dhb, p_reason, p_ref, p_metadata)
  ON CONFLICT (reason, ref) WHERE ref IS NOT NULL AND delta_dhb > 0 DO NOTHING;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CREDIT_ALREADY_APPLIED';
  END IF;

  INSERT INTO ai_credits (wallet_address, balance_dhb, lifetime_granted_dhb)
  VALUES (lower(p_wallet), p_dhb, p_dhb)
  ON CONFLICT (wallet_address) DO UPDATE SET
    balance_dhb = ai_credits.balance_dhb + EXCLUDED.balance_dhb,
    lifetime_granted_dhb = ai_credits.lifetime_granted_dhb + EXCLUDED.lifetime_granted_dhb,
    updated_at = now()
  RETURNING balance_dhb INTO v_balance;

  RETURN v_balance;
END; $$;

COMMENT ON FUNCTION public.ai_credit_grant(text, numeric, text, text, jsonb) IS
  'Add credit. Idempotent per (reason, ref) — raises CREDIT_ALREADY_APPLIED on a replay.';

CREATE OR REPLACE FUNCTION public.ai_credit_spend(
  p_wallet text,
  p_dhb numeric,
  p_model_id text,
  p_ref text,
  p_metadata jsonb DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance numeric;
BEGIN
  IF p_dhb IS NULL OR p_dhb <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- Single statement, so the balance check and the debit cannot be raced by
  -- two generations submitted at once.
  UPDATE ai_credits
  SET balance_dhb = balance_dhb - p_dhb,
      lifetime_spent_dhb = lifetime_spent_dhb + p_dhb,
      updated_at = now()
  WHERE wallet_address = lower(p_wallet)
    AND balance_dhb >= p_dhb
  RETURNING balance_dhb INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  INSERT INTO ai_credit_ledger (wallet_address, delta_dhb, reason, ref, model_id, metadata)
  VALUES (lower(p_wallet), -p_dhb, 'spend', p_ref, p_model_id, p_metadata);

  RETURN v_balance;
END; $$;

COMMENT ON FUNCTION public.ai_credit_spend(text, numeric, text, text, jsonb) IS
  'Debit for one generation. Raises INSUFFICIENT_CREDITS rather than going negative.';

CREATE OR REPLACE FUNCTION public.ai_credit_refund(
  p_wallet text,
  p_dhb numeric,
  p_ref text
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Same ref as the spend it reverses, under reason 'refund', so a retried
  -- failure handler cannot pay the same job back twice.
  RETURN ai_credit_grant(p_wallet, p_dhb, 'refund', p_ref, NULL);
END; $$;

COMMENT ON FUNCTION public.ai_credit_refund(text, numeric, text) IS
  'Return a debit after a provider failure. Idempotent on the job ref.';

-- ============================================================================
-- 4. Access
-- ============================================================================
-- A wallet may read its own balance and history. It may not write either —
-- every movement goes through the functions above, which only the service role
-- can execute, and those are only reachable from edge functions that have
-- verified a DeHub token.
--
-- get_request_wallet_address() reads an unsigned header, so these SELECT
-- policies are advisory: a forged header can read someone else's balance. That
-- is deliberate scope — the boundary that matters is that credit cannot be
-- fabricated and someone else's balance cannot be spent, and both of those sit
-- behind authenticated edge functions rather than behind RLS.

ALTER TABLE public.ai_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wallets read own credit balance" ON public.ai_credits;
CREATE POLICY "Wallets read own credit balance" ON public.ai_credits
  FOR SELECT TO anon, authenticated
  USING (wallet_address = public.get_request_wallet_address());

DROP POLICY IF EXISTS "Service role manages credit balances" ON public.ai_credits;
CREATE POLICY "Service role manages credit balances" ON public.ai_credits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Wallets read own credit ledger" ON public.ai_credit_ledger;
CREATE POLICY "Wallets read own credit ledger" ON public.ai_credit_ledger
  FOR SELECT TO anon, authenticated
  USING (wallet_address = public.get_request_wallet_address());

DROP POLICY IF EXISTS "Service role manages credit ledger" ON public.ai_credit_ledger;
CREATE POLICY "Service role manages credit ledger" ON public.ai_credit_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON FUNCTION public.ai_credit_grant(text, numeric, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_credit_spend(text, numeric, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_credit_refund(text, numeric, text) FROM PUBLIC, anon, authenticated;
