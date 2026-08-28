-- ============================================================================
-- Generation is paid in live DHB. The credit ledger is gone.
-- ============================================================================
-- The old arrangement kept a per-wallet balance (ai_credits / ai_credit_ledger)
-- that could be filled three ways: an on-chain top-up, a Stripe plan grant, or
-- a free starter/daily allowance minted out of nothing. Two of those three
-- created spendable value with no token behind it, which made the balance a
-- second currency sitting alongside DHB and drifting from it.
--
-- Now there is one thing: a transfer that actually happened. A wallet pays for
-- the job it is about to run, the backend confirms the transfer on chain, and
-- the row below is the receipt. No balance is granted, so none can be minted.
--
-- The receipt is spent down rather than consumed whole, because voice is billed
-- per exchange and cannot ask for a signature between every sentence: one
-- transfer opens a voice session and each exchange draws from it. A one-shot
-- image or video simply draws its whole price at once. That is deliberately NOT
-- a balance -- it is bounded by a single transfer, cannot be topped up, and
-- nothing can add to it except the chain.

-- ============================================================================
-- 1. Receipts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  -- One receipt per transfer. This is the whole replay story: a hash sent
  -- twice collides here rather than paying for two jobs.
  tx_hash text NOT NULL UNIQUE,
  chain text NOT NULL,
  paid_dhb numeric NOT NULL CHECK (paid_dhb > 0),
  remaining_dhb numeric NOT NULL CHECK (remaining_dhb >= 0),
  -- 'job' | 'voice'
  purpose text NOT NULL DEFAULT 'job',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_payments_wallet
  ON public.ai_payments (wallet_address, created_at DESC);

COMMENT ON TABLE public.ai_payments IS
  'On-chain DHB paid for AI generation, spent down per job. Only ai_payment_spend / ai_payment_release may move remaining_dhb.';

-- Refunds are keyed on the job they reverse, so a retried error handler cannot
-- hand the same job back twice.
CREATE TABLE IF NOT EXISTS public.ai_payment_refunds (
  job_id text PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES public.ai_payments(id) ON DELETE CASCADE,
  dhb numeric NOT NULL CHECK (dhb > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. Movements
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ai_payment_spend(
  p_tx_hash text,
  p_wallet text,
  p_dhb numeric
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_remaining numeric;
BEGIN
  IF p_dhb IS NULL OR p_dhb <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- Single statement, so the sufficiency check and the debit cannot be raced
  -- by two generations submitted against one receipt at the same moment.
  UPDATE ai_payments
  SET remaining_dhb = remaining_dhb - p_dhb,
      updated_at = now()
  WHERE tx_hash = lower(p_tx_hash)
    AND wallet_address = lower(p_wallet)
    AND remaining_dhb >= p_dhb
  RETURNING remaining_dhb INTO v_remaining;

  IF NOT FOUND THEN
    -- Distinguish the two failures the caller has to report differently: a
    -- receipt that is short is a price, one that is missing is an error.
    IF EXISTS (SELECT 1 FROM ai_payments WHERE tx_hash = lower(p_tx_hash)
               AND wallet_address = lower(p_wallet)) THEN
      RAISE EXCEPTION 'PAYMENT_EXHAUSTED';
    END IF;
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;

  RETURN v_remaining;
END; $$;

COMMENT ON FUNCTION public.ai_payment_spend(text, text, numeric) IS
  'Draw the price of one job from a receipt. Raises PAYMENT_EXHAUSTED rather than going negative.';

CREATE OR REPLACE FUNCTION public.ai_payment_release(
  p_tx_hash text,
  p_wallet text,
  p_dhb numeric,
  p_job_id text
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment_id uuid;
  v_remaining numeric;
BEGIN
  SELECT id INTO v_payment_id FROM ai_payments
  WHERE tx_hash = lower(p_tx_hash) AND wallet_address = lower(p_wallet);
  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;

  -- Claim the job first, so a replayed release fails before anything moves.
  INSERT INTO ai_payment_refunds (job_id, payment_id, dhb)
  VALUES (p_job_id, v_payment_id, p_dhb)
  ON CONFLICT (job_id) DO NOTHING;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REFUND_ALREADY_APPLIED';
  END IF;

  -- Capped at what was paid: a release can only ever undo a draw, never lift
  -- a receipt above the transfer behind it.
  UPDATE ai_payments
  SET remaining_dhb = LEAST(remaining_dhb + p_dhb, paid_dhb),
      updated_at = now()
  WHERE id = v_payment_id
  RETURNING remaining_dhb INTO v_remaining;

  RETURN v_remaining;
END; $$;

COMMENT ON FUNCTION public.ai_payment_release(text, text, numeric, text) IS
  'Put a failed job price back on its receipt so the same transfer can be retried. Idempotent on job id.';

-- ============================================================================
-- 3. Access
-- ============================================================================
-- A wallet may read its own receipts and nothing else. Every movement goes
-- through the functions above, which only the service role can execute, and
-- those are only reachable from edge functions that have verified a DeHub
-- token and confirmed the transfer on chain.

ALTER TABLE public.ai_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_payment_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wallets read own AI payments" ON public.ai_payments;
CREATE POLICY "Wallets read own AI payments" ON public.ai_payments
  FOR SELECT TO anon, authenticated
  USING (wallet_address = public.get_request_wallet_address());

DROP POLICY IF EXISTS "Service role manages AI payments" ON public.ai_payments;
CREATE POLICY "Service role manages AI payments" ON public.ai_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages AI payment refunds" ON public.ai_payment_refunds;
CREATE POLICY "Service role manages AI payment refunds" ON public.ai_payment_refunds
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON FUNCTION public.ai_payment_spend(text, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_payment_release(text, text, numeric, text) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. Remove the ledger
-- ============================================================================
-- Balances were free starter and daily allowances plus plan grants; none of it
-- was bought with a token that is not already in the treasury, so there is
-- nothing to pay out before dropping it. Plan allowances now settle only as
-- real DHB sent to the subscriber's wallet.

DROP FUNCTION IF EXISTS public.ai_credit_claim_daily(text, numeric, numeric, numeric);
DROP FUNCTION IF EXISTS public.ai_credit_refund(text, numeric, text);
DROP FUNCTION IF EXISTS public.ai_credit_spend(text, numeric, text, text, jsonb);
DROP FUNCTION IF EXISTS public.ai_credit_grant(text, numeric, text, text, jsonb);

DROP TABLE IF EXISTS public.ai_credit_ledger;
DROP TABLE IF EXISTS public.ai_credits;
