INSERT INTO public.user_display_preferences (wallet_address, preferences, shorts_enabled, reaction_tip_seen)
VALUES ('0x1111111111111111111111111111111111111111', '{"language":"es"}', false, true);

SET ROLE anon;
DO $$
BEGIN
  PERFORM public.test_dub_session('0x1111111111111111111111111111111111111111', false);
  IF public.claim_video_dub_tip() THEN RAISE EXCEPTION 'Unsigned caller claimed a hint'; END IF;
  PERFORM public.test_dub_session('0x1111111111111111111111111111111111111111');
  IF NOT public.claim_video_dub_tip() THEN RAISE EXCEPTION 'First signed claim failed'; END IF;
  IF public.claim_video_dub_tip() THEN RAISE EXCEPTION 'Repeat claim succeeded'; END IF;
  PERFORM public.test_dub_session('0x2222222222222222222222222222222222222222');
  IF NOT public.claim_video_dub_tip() THEN RAISE EXCEPTION 'Different account could not claim'; END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_display_preferences WHERE wallet_address = '0x9999999999999999999999999999999999999999') THEN
    RAISE EXCEPTION 'Unsigned target header was trusted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_display_preferences WHERE wallet_address = '0x1111111111111111111111111111111111111111'
    AND video_dub_tip_seen AND reaction_tip_seen AND NOT shorts_enabled AND preferences ->> 'language' = 'es') THEN
    RAISE EXCEPTION 'Claim changed unrelated preferences';
  END IF;
  IF has_table_privilege('anon', 'public.user_display_preferences', 'UPDATE') THEN
    RAISE EXCEPTION 'Migration gave anonymous clients table writes';
  END IF;
END;
$$;

-- Existing whole-blob saves must leave the learning flag alone.
INSERT INTO public.user_display_preferences (wallet_address, preferences)
VALUES ('0x1111111111111111111111111111111111111111', '{"language":"fr"}')
ON CONFLICT (wallet_address) DO UPDATE SET preferences = excluded.preferences;
SET ROLE authenticated;
DO $$
BEGIN
  PERFORM public.test_dub_session('0x1111111111111111111111111111111111111111');
  IF public.claim_video_dub_tip() THEN RAISE EXCEPTION 'A preference save reset the claim'; END IF;
END;
$$;
RESET ROLE;
