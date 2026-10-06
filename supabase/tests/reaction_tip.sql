BEGIN;

DO $$
DECLARE
  wallet text := '0x00000000000000000000000000000000000a71c1';
  other text := '0x00000000000000000000000000000000000a71c2';
BEGIN
  PERFORM set_config('dehub.signed_wallet', 'v:', true);
  IF public.claim_reaction_tip() THEN
    RAISE EXCEPTION 'Unsigned callers cannot claim a hint';
  END IF;

  INSERT INTO public.user_display_preferences(wallet_address, preferences, shorts_enabled)
    VALUES (wallet, '{"theme":"minimal"}'::jsonb, false);
  PERFORM set_config('dehub.signed_wallet', 'v:' || wallet, true);
  IF NOT public.claim_reaction_tip() THEN
    RAISE EXCEPTION 'First claim must return true';
  END IF;
  IF public.claim_reaction_tip() THEN
    RAISE EXCEPTION 'A second client must receive false';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_display_preferences
    WHERE wallet_address = wallet AND reaction_tip_seen
      AND preferences = '{"theme":"minimal"}'::jsonb AND NOT shorts_enabled
  ) THEN
    RAISE EXCEPTION 'Claim must preserve existing preferences';
  END IF;

  UPDATE public.user_display_preferences SET preferences = '{"theme":"system"}'::jsonb
    WHERE wallet_address = wallet;
  IF public.claim_reaction_tip() THEN
    RAISE EXCEPTION 'A preference save must not reset learned state';
  END IF;

  PERFORM set_config('dehub.signed_wallet', 'v:' || other, true);
  IF NOT public.claim_reaction_tip() THEN
    RAISE EXCEPTION 'Another account has its own claim';
  END IF;
  IF public.claim_reaction_tip() THEN
    RAISE EXCEPTION 'A new preference row must also be once-only';
  END IF;
END;
$$;

ROLLBACK;
