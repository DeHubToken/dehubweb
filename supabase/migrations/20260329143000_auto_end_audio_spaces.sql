  -- 1) When a participant gets left_at set: end the stage if host left OR nobody is still in the room.
  CREATE OR REPLACE FUNCTION public.auto_end_audio_space_on_participant_leave()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  BEGIN
    IF TG_OP <> 'UPDATE' THEN
      RETURN NEW;
    END IF;

    -- Only when transitioning to "left"
    IF OLD.left_at IS NOT NULL OR NEW.left_at IS NULL THEN
      RETURN NEW;
    END IF;

    -- Host left → end for everyone
    IF NEW.role = 'host' THEN
      UPDATE public.audio_spaces
      SET
        status = 'ended',
        ended_at = COALESCE(ended_at, now())
      WHERE id = NEW.space_id
        AND status = 'live';
      RETURN NEW;
    END IF;

    -- Last person left → end empty room
    IF NOT EXISTS (
      SELECT 1
      FROM public.space_participants
      WHERE space_id = NEW.space_id
        AND left_at IS NULL
    ) THEN
      UPDATE public.audio_spaces
      SET
        status = 'ended',
        ended_at = COALESCE(ended_at, now())
      WHERE id = NEW.space_id
        AND status = 'live';
    END IF;

    RETURN NEW;
  END;
  $$;

  DROP TRIGGER IF EXISTS tr_audio_space_participant_left ON public.space_participants;

  CREATE TRIGGER tr_audio_space_participant_left
    AFTER UPDATE OF left_at ON public.space_participants
    FOR EACH ROW
    EXECUTE PROCEDURE public.auto_end_audio_space_on_participant_leave();

  -- 2) One-time cleanup: already "empty" in DB but still marked live (historical + race cases)
  UPDATE public.audio_spaces AS a
  SET
    status = 'ended',
    ended_at = COALESCE(a.ended_at, now())
  WHERE a.status = 'live'
    AND NOT EXISTS (
      SELECT 1
      FROM public.space_participants sp
      WHERE sp.space_id = a.id
        AND sp.left_at IS NULL
    );
