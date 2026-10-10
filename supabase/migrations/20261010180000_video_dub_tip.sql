-- Separate from the whole-object preference blob, so saves from older clients
-- cannot reset a hint already claimed on another device.
ALTER TABLE public.user_display_preferences
  ADD COLUMN IF NOT EXISTS video_dub_tip_seen boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.claim_video_dub_tip()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wallet text := public.get_signed_request_wallet_address();
  claimed boolean := false;
BEGIN
  IF wallet IS NULL OR wallet = '' THEN RETURN false; END IF;

  INSERT INTO public.user_display_preferences AS prefs (wallet_address, video_dub_tip_seen)
  VALUES (wallet, true)
  ON CONFLICT (wallet_address) DO UPDATE
    SET video_dub_tip_seen = true
    WHERE prefs.video_dub_tip_seen = false
  RETURNING true INTO claimed;

  RETURN coalesce(claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_video_dub_tip() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_video_dub_tip() TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
