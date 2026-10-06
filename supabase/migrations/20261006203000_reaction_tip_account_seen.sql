-- Keep learning state separate from the preference blob, whose whole-object
-- saves must never reset a hint learned on another client.
ALTER TABLE public.user_display_preferences
  ADD COLUMN IF NOT EXISTS reaction_tip_seen boolean NOT NULL DEFAULT false;

-- Atomically claim the hint. Only one of two concurrent clients receives true.
-- The wallet comes from the signed session, never from a caller-supplied target.
CREATE OR REPLACE FUNCTION public.claim_reaction_tip()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wallet text := public.get_signed_request_wallet_address();
  claimed boolean := false;
BEGIN
  IF wallet IS NULL OR wallet = '' THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_display_preferences AS prefs (wallet_address, reaction_tip_seen)
  VALUES (wallet, true)
  ON CONFLICT (wallet_address) DO UPDATE
    SET reaction_tip_seen = true
    WHERE prefs.reaction_tip_seen = false
  RETURNING true INTO claimed;

  RETURN coalesce(claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_reaction_tip() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_reaction_tip() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
