-- ============================================================================
-- Atomic daily free-credit claim
-- ============================================================================
-- The starter grant and the daily allowance move into one SECURITY DEFINER
-- function rather than living as a read-then-insert sequence in the edge
-- function. The sequence had a real hole: the "last claim" SELECT and the
-- grant INSERT ran in separate transactions, and the ledger's (reason, ref)
-- unique index only dedupes identical refs. Two requests straddling UTC
-- midnight build refs for *different* dates — daily:{w}:{D} and
-- daily:{w}:{D+1} — so both pass the stale read and both pay the same missed
-- days. For a wallet dormant past the cap that is the full cap twice.
--
-- Serializing per wallet with an advisory lock closes it: the second claim
-- waits, re-reads after the first commits, and correctly gets one day.

CREATE OR REPLACE FUNCTION public.ai_credit_claim_daily(
  p_wallet text,
  p_starter_dhb numeric,
  p_daily_dhb numeric,
  p_cap_dhb numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wallet text := lower(p_wallet);
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_last date;
  v_days integer;
  v_daily numeric;
  v_granted numeric := 0;
  v_balance numeric;
BEGIN
  IF p_starter_dhb IS NULL OR p_daily_dhb IS NULL OR p_cap_dhb IS NULL
     OR p_starter_dhb < 0 OR p_daily_dhb <= 0 OR p_cap_dhb <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- One claim per wallet at a time, for the rest of this transaction.
  PERFORM pg_advisory_xact_lock(hashtext('ai_credit_claim_daily:' || v_wallet));

  -- Starter, once ever. Probed with EXISTS rather than caught from the grant
  -- so the common path (already claimed) does not raise an exception per
  -- request. The guard below still catches the race against a legacy
  -- claim-free call, which does not take our lock.
  IF p_starter_dhb > 0 AND NOT EXISTS (
    SELECT 1 FROM ai_credit_ledger
    WHERE reason = 'free_grant' AND ref = v_wallet AND delta_dhb > 0
  ) THEN
    BEGIN
      PERFORM ai_credit_grant(v_wallet, p_starter_dhb, 'free_grant', v_wallet, NULL);
      v_granted := p_starter_dhb;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'CREDIT_ALREADY_APPLIED' THEN RAISE; END IF;
    END;
  END IF;

  -- Latest daily claim by the date embedded in the ref, not by created_at.
  -- The fixed 'daily:{wallet}:' prefix means lexical order equals date order,
  -- and unlike an insertion timestamp the ref cannot disagree with what was
  -- actually paid.
  SELECT max(right(ref, 10))::date INTO v_last
  FROM ai_credit_ledger
  WHERE wallet_address = v_wallet
    AND reason = 'free_grant'
    AND ref LIKE 'daily:' || v_wallet || ':%';

  -- A first claim starts at one day rather than back-paying to signup: the
  -- allowance rewards coming back, and days before the feature existed are
  -- not a debt we owe. Missed days accrue so an occasional visitor collects
  -- the gap, capped so a dormant wallet cannot return and mint unbounded
  -- credit.
  v_days := COALESCE(v_today - v_last, 1);

  IF v_days > 0 THEN
    v_daily := LEAST(v_days * p_daily_dhb, p_cap_dhb);
    BEGIN
      PERFORM ai_credit_grant(
        v_wallet,
        v_daily,
        'free_grant',
        'daily:' || v_wallet || ':' || to_char(v_today, 'YYYY-MM-DD'),
        jsonb_build_object('days', v_days)
      );
      v_granted := v_granted + v_daily;
    EXCEPTION WHEN OTHERS THEN
      -- A concurrent writer that predates this function (an old edge-function
      -- deploy still doing read-then-insert) can land today's ref between our
      -- lock and this insert. Their grant paid the day; ours is a no-op.
      IF SQLERRM <> 'CREDIT_ALREADY_APPLIED' THEN RAISE; END IF;
    END;
  END IF;

  SELECT balance_dhb INTO v_balance
  FROM ai_credits WHERE wallet_address = v_wallet;

  RETURN jsonb_build_object(
    'granted_dhb', v_granted,
    'already_claimed', v_granted = 0,
    'balance_dhb', COALESCE(v_balance, 0)
  );
END; $$;

COMMENT ON FUNCTION public.ai_credit_claim_daily(text, numeric, numeric, numeric) IS
  'Starter + daily free allowance in one per-wallet-serialized transaction. Amounts come from the caller (ai-plans.ts is the authority); idempotent per UTC day via the ledger''s (reason, ref) unique index.';

REVOKE ALL ON FUNCTION public.ai_credit_claim_daily(text, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
