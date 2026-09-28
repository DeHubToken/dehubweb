ALTER TABLE public.audio_spaces ADD COLUMN last_speech_at timestamptz DEFAULT now();
UPDATE public.audio_spaces SET last_speech_at = now() WHERE status = 'live';

CREATE OR REPLACE FUNCTION public.touch_stage_speech(space_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w text := public.get_request_wallet_address();
  allowed boolean;
BEGIN
  IF w IS NULL OR w = '' THEN RETURN false; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.audio_spaces s
    WHERE s.id = touch_stage_speech.space_id AND s.status = 'live'
      AND (lower(s.host_wallet_address) = w
        OR EXISTS (SELECT 1 FROM public.space_participants p
                   WHERE p.space_id = s.id AND lower(p.wallet_address) = w
                     AND p.left_at IS NULL AND p.role IN ('host','speaker')))
  ) INTO allowed;
  IF NOT allowed THEN RETURN false; END IF;

  UPDATE public.audio_spaces s SET last_speech_at = now()
  WHERE s.id = touch_stage_speech.space_id AND s.status = 'live'
    AND (s.last_speech_at IS NULL OR s.last_speech_at < now() - interval '60 seconds');
  RETURN FOUND;
END; $function$;

REVOKE ALL ON FUNCTION public.touch_stage_speech(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_stage_speech(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.end_inactive_stages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ended_ids uuid[];
BEGIN
  WITH ended AS (
    UPDATE public.audio_spaces
    SET status = 'ended', ended_at = now(), listener_count = 0, speaker_count = 0
    WHERE status = 'live'
      AND COALESCE(last_speech_at, started_at) < now() - interval '30 minutes'
    RETURNING id
  )
  SELECT array_agg(id) INTO ended_ids FROM ended;

  IF ended_ids IS NULL THEN RETURN 0; END IF;

  UPDATE public.space_participants SET left_at = now()
  WHERE space_id = ANY(ended_ids) AND left_at IS NULL;

  RETURN array_length(ended_ids, 1);
END; $function$;

REVOKE ALL ON FUNCTION public.end_inactive_stages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_inactive_stages() TO service_role;