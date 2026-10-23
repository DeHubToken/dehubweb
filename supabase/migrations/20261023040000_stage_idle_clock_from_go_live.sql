-- A scheduled stage keeps the last_speech_at it was given when it was
-- announced, so the 30-minute idle sweep ended it on its first run after
-- going live. Restart the idle clock whenever a stage goes live, and never
-- count silence from before started_at.

CREATE OR REPLACE FUNCTION public.reset_stage_speech_on_go_live()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'live' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'live') THEN
    NEW.last_speech_at := now();
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS audio_spaces_reset_speech_on_go_live ON public.audio_spaces;
CREATE TRIGGER audio_spaces_reset_speech_on_go_live
  BEFORE INSERT OR UPDATE OF status ON public.audio_spaces
  FOR EACH ROW EXECUTE FUNCTION public.reset_stage_speech_on_go_live();

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
      AND GREATEST(COALESCE(last_speech_at, started_at), started_at) < now() - interval '30 minutes'
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
