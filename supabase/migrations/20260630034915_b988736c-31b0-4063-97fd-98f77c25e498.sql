ALTER TABLE public.premium_subscriptions
  ADD COLUMN IF NOT EXISTS xl_cashback_eligible boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_premium_subscriptions_xl_cashback
  ON public.premium_subscriptions(price_id, status, xl_cashback_eligible);

-- Atomically claim one of the first 50 active XL cashback slots.
-- Returns true if the caller got a slot, false if all 50 are taken.
CREATE OR REPLACE FUNCTION public.claim_xl_cashback_slot(
  p_subscription_id text,
  p_xl_price_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already boolean;
  v_active_count integer;
BEGIN
  SELECT xl_cashback_eligible INTO v_already
  FROM public.premium_subscriptions
  WHERE stripe_subscription_id = p_subscription_id;

  IF v_already THEN RETURN true; END IF;

  -- Lock active XL rows so two concurrent webhooks can't both claim slot #50.
  PERFORM 1 FROM public.premium_subscriptions
  WHERE price_id = p_xl_price_id
    AND xl_cashback_eligible = true
    AND status IN ('active', 'trialing', 'past_due')
  FOR UPDATE;

  SELECT COUNT(*) INTO v_active_count
  FROM public.premium_subscriptions
  WHERE price_id = p_xl_price_id
    AND xl_cashback_eligible = true
    AND status IN ('active', 'trialing', 'past_due');

  IF v_active_count >= 50 THEN RETURN false; END IF;

  UPDATE public.premium_subscriptions
  SET xl_cashback_eligible = true, updated_at = now()
  WHERE stripe_subscription_id = p_subscription_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_xl_cashback_slot(text, text) TO service_role;